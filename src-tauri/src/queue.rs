//! Download queue: runs yt-dlp jobs with a concurrency limit, streams their
//! progress to the UI and supports cancel / retry.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

use crate::binaries;
use crate::history::{self, HistoryEntry};
use crate::process;
use crate::ytdlp::{self, DownloadOptions, Event, Mode, PlaylistContext};

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Downloading,
    Processing,
    Done,
    Error,
    Cancelled,
}

impl JobStatus {
    fn is_active(self) -> bool {
        matches!(self, JobStatus::Downloading | JobStatus::Processing)
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub url: String,
    pub video_id: Option<String>,
    pub title: String,
    pub thumbnail: Option<String>,
    pub options: DownloadOptions,
    pub playlist: Option<PlaylistContext>,
    pub status: JobStatus,
    /// Code for the current step, translated by the UI: "starting", "cancelling",
    /// "downloading", "part:2", or "pp:<postprocessor>".
    pub stage: Option<String>,
    pub percent: Option<f64>,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub speed: Option<f64>,
    pub eta: Option<u64>,
    pub filepath: Option<String>,
    pub error: Option<String>,
    /// Last lines of yt-dlp output, shown when a job fails.
    pub log: Vec<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueItem {
    pub url: String,
    pub video_id: Option<String>,
    pub title: String,
    pub thumbnail: Option<String>,
    pub options: DownloadOptions,
    pub playlist: Option<PlaylistContext>,
}

#[derive(Default)]
struct Running {
    pid: Option<u32>,
    cancelled: bool,
}

struct Inner {
    jobs: Vec<Job>,
    concurrency: usize,
    running: HashMap<String, Running>,
}

pub struct Queue(Mutex<Inner>);

pub type QueueState = Arc<Queue>;

impl Default for Queue {
    fn default() -> Self {
        Queue(Mutex::new(Inner {
            jobs: Vec::new(),
            concurrency: 2,
            running: HashMap::new(),
        }))
    }
}

const LOG_LINES: usize = 40;

fn queue(app: &AppHandle) -> QueueState {
    app.state::<QueueState>().inner().clone()
}

fn emit_job(app: &AppHandle, job: &Job) {
    let _ = app.emit("queue://job", job);
}

/// Mutate one job under the lock and push the new state to the UI.
fn update(app: &AppHandle, id: &str, f: impl FnOnce(&mut Job)) -> Option<Job> {
    let q = queue(app);
    let job = {
        let mut g = q.0.lock().unwrap();
        let job = g.jobs.iter_mut().find(|j| j.id == id)?;
        f(job);
        job.clone()
    };
    emit_job(app, &job);
    Some(job)
}

pub fn list(app: &AppHandle) -> Vec<Job> {
    queue(app).0.lock().unwrap().jobs.clone()
}

pub fn has_active(app: &AppHandle) -> bool {
    queue(app)
        .0
        .lock()
        .unwrap()
        .jobs
        .iter()
        .any(|j| j.status.is_active())
}

pub fn enqueue(app: &AppHandle, items: Vec<EnqueueItem>) -> Vec<Job> {
    let jobs: Vec<Job> = items
        .into_iter()
        .map(|i| Job {
            id: uuid::Uuid::new_v4().to_string(),
            url: i.url,
            video_id: i.video_id,
            title: i.title,
            thumbnail: i.thumbnail,
            options: i.options,
            playlist: i.playlist,
            status: JobStatus::Queued,
            stage: None,
            percent: None,
            downloaded_bytes: None,
            total_bytes: None,
            speed: None,
            eta: None,
            filepath: None,
            error: None,
            log: Vec::new(),
        })
        .collect();
    queue(app)
        .0
        .lock()
        .unwrap()
        .jobs
        .extend(jobs.iter().cloned());
    for j in &jobs {
        emit_job(app, j);
    }
    schedule(app);
    jobs
}

pub fn set_concurrency(app: &AppHandle, n: usize) {
    queue(app).0.lock().unwrap().concurrency = n.clamp(1, 5);
    schedule(app);
}

/// Start as many queued jobs as the concurrency limit allows.
fn schedule(app: &AppHandle) {
    let q = queue(app);
    let to_start: Vec<Job> = {
        let mut g = q.0.lock().unwrap();
        let slots = g.concurrency.saturating_sub(g.running.len());
        let mut started = Vec::new();
        for job in g
            .jobs
            .iter_mut()
            .filter(|j| j.status == JobStatus::Queued)
            .take(slots)
        {
            job.status = JobStatus::Downloading;
            job.stage = Some("starting".into());
            started.push(job.clone());
        }
        for j in &started {
            g.running.insert(j.id.clone(), Running::default());
        }
        started
    };
    for job in to_start {
        emit_job(app, &job);
        let app = app.clone();
        tauri::async_runtime::spawn(async move { run_job(app, job).await });
    }
}

pub fn cancel(app: &AppHandle, id: &str) {
    let q = queue(app);
    let (pid, was_queued) = {
        let mut g = q.0.lock().unwrap();
        let was_queued = g
            .jobs
            .iter_mut()
            .find(|j| j.id == id && j.status == JobStatus::Queued)
            .map(|j| j.status = JobStatus::Cancelled)
            .is_some();
        let pid = g.running.get_mut(id).and_then(|r| {
            r.cancelled = true;
            r.pid
        });
        (pid, was_queued)
    };
    if was_queued {
        update(app, id, |j| j.stage = None);
    }
    if let Some(pid) = pid {
        update(app, id, |j| j.stage = Some("cancelling".into()));
        process::kill_tree(pid);
    }
}

pub fn retry(app: &AppHandle, id: &str) {
    update(app, id, |j| {
        if matches!(j.status, JobStatus::Error | JobStatus::Cancelled) {
            j.status = JobStatus::Queued;
            j.error = None;
            j.stage = None;
            j.percent = None;
            j.log.clear();
        }
    });
    schedule(app);
}

/// Remove finished/failed/cancelled jobs (or one specific job) from the list.
pub fn remove(app: &AppHandle, id: Option<&str>) {
    let q = queue(app);
    let removed: Vec<String> = {
        let mut g = q.0.lock().unwrap();
        let mut removed = Vec::new();
        g.jobs.retain(|j| {
            let matches = id.is_none_or(|id| j.id == id);
            let removable =
                !j.status.is_active() && (id.is_some() || j.status != JobStatus::Queued);
            if matches && removable {
                removed.push(j.id.clone());
                false
            } else {
                true
            }
        });
        removed
    };
    for id in removed {
        let _ = app.emit("queue://removed", id);
    }
}

/// Kill every running yt-dlp (used when the app quits).
pub fn kill_all(app: &AppHandle) {
    let pids: Vec<u32> = {
        let q = queue(app);
        let mut g = q.0.lock().unwrap();
        g.running
            .values_mut()
            .filter_map(|r| {
                r.cancelled = true;
                r.pid
            })
            .collect()
    };
    for pid in pids {
        process::kill_tree(pid);
    }
}

async fn run_job(app: AppHandle, job: Job) {
    let result = execute(&app, &job).await;

    let cancelled = {
        let q = queue(&app);
        let mut g = q.0.lock().unwrap();
        g.running.remove(&job.id).is_some_and(|r| r.cancelled)
    };

    let finished = update(&app, &job.id, |j| {
        j.speed = None;
        j.eta = None;
        if cancelled {
            j.status = JobStatus::Cancelled;
            j.stage = None;
        } else {
            match &result {
                Ok(path) => {
                    j.status = JobStatus::Done;
                    j.stage = None;
                    j.percent = Some(100.0);
                    if path.is_some() {
                        j.filepath = path.clone();
                    }
                }
                Err(e) => {
                    j.status = JobStatus::Error;
                    j.stage = None;
                    j.error = Some(e.clone());
                }
            }
        }
    });

    if cancelled {
        remove_partials(&job);
    } else if let Some(j) = finished.filter(|j| j.status == JobStatus::Done) {
        let size_bytes = j
            .filepath
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len());
        let completed_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let _ = history::append(
            &app,
            HistoryEntry {
                id: j.id.clone(),
                url: j.url.clone(),
                video_id: j.video_id.clone(),
                title: j.title.clone(),
                thumbnail: j.thumbnail.clone(),
                filepath: j.filepath.clone(),
                mode: match j.options.mode {
                    Mode::Video => "video".into(),
                    Mode::Audio => "audio".into(),
                },
                size_bytes,
                completed_at,
                exists: false,
            },
        );
    }
    schedule(&app);
}

/// Run yt-dlp for one job. Returns the final file path on success.
async fn execute(app: &AppHandle, job: &Job) -> Result<Option<String>, String> {
    let (ytdlp_path, _) = binaries::find_executable(app, "yt-dlp").ok_or("E:ytdlp_missing")?;
    let ffmpeg = binaries::find_executable(app, "ffmpeg").map(|(p, _)| p);
    let deno = binaries::find_executable(app, "deno").map(|(p, _)| p);
    let tools = ytdlp::Tools {
        ffmpeg: ffmpeg.as_deref(),
        deno: deno.as_deref(),
    };
    let args = ytdlp::build_args(&job.url, &job.options, job.playlist.as_ref(), &tools);

    std::fs::create_dir_all(&job.options.output_dir)
        .map_err(|e| format!("E:download_folder:{e}"))?;

    let mut cmd = process::command(&ytdlp_path);
    cmd.args(&args)
        .env("PATH", binaries::child_path(app))
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    process::isolate(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("E:ytdlp_start_failed:{e}"))?;

    // Register the pid; honour a cancel that arrived while we were starting.
    let cancelled_early = {
        let q = queue(app);
        let mut g = q.0.lock().unwrap();
        match g.running.get_mut(&job.id) {
            Some(r) => {
                r.pid = child.id();
                r.cancelled
            }
            None => false,
        }
    };
    if cancelled_early && let Some(pid) = child.id() {
        process::kill_tree(pid);
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    for stream in [
        child
            .stdout
            .take()
            .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        child
            .stderr
            .take()
            .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
    }
    drop(tx);

    let mut log: Vec<String> = Vec::new();
    let mut filepath: Option<String> = None;
    let mut parts_done = 0u32;
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    while let Some(line) = rx.recv().await {
        match ytdlp::parse_line(&line) {
            Some(Event::Download {
                status,
                downloaded,
                total,
                speed,
                eta,
            }) => {
                let finished = status == "finished";
                if !finished && last_emit.elapsed() < Duration::from_millis(150) {
                    continue;
                }
                last_emit = Instant::now();
                let part = parts_done + 1;
                if finished {
                    parts_done += 1;
                }
                update(app, &job.id, |j| {
                    j.status = JobStatus::Downloading;
                    j.stage = Some(if part > 1 {
                        format!("part:{part}")
                    } else {
                        "downloading".into()
                    });

                    j.downloaded_bytes = downloaded;
                    j.total_bytes = total.or(j.total_bytes);
                    j.speed = speed;
                    j.eta = eta;
                    j.percent = match (downloaded, total) {
                        (Some(d), Some(t)) if t > 0 => {
                            Some((d as f64 / t as f64 * 100.0).min(100.0))
                        }
                        _ if finished => Some(100.0),
                        _ => j.percent,
                    };
                });
            }
            Some(Event::PostProcess { status, name }) => {
                if status == "started" {
                    update(app, &job.id, |j| {
                        j.status = JobStatus::Processing;
                        j.stage = Some(ytdlp::postprocessor_label(&name));
                        j.speed = None;
                        j.eta = None;
                    });
                }
            }
            Some(Event::File(path)) => filepath = Some(path),
            None => {
                let line = line.trim();
                if !line.is_empty() {
                    log.push(line.to_string());
                    if log.len() > LOG_LINES {
                        log.remove(0);
                    }
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        return Ok(filepath);
    }
    let error = ytdlp::friendly_error(&log, status.code());
    update(app, &job.id, |j| j.log = log);
    Err(error)
}

/// Delete the leftovers of a cancelled download: `.part`/`.ytdl` files and
/// the per-format intermediates (`… [id].f137.mp4`) next to the target.
fn remove_partials(job: &Job) {
    let Some(video_id) = job.video_id.as_deref() else {
        return;
    };
    let mut dir = PathBuf::from(&job.options.output_dir);
    if let Some(p) = &job.playlist {
        dir.push(ytdlp::sanitize_folder(&p.title).replace("%%", "%"));
    }
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_partial(&name, video_id) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn is_partial(name: &str, video_id: &str) -> bool {
    let marker = format!("[{video_id}]");
    let Some(pos) = name.find(&marker) else {
        return false;
    };
    let rest = &name[pos + marker.len()..];
    if rest.ends_with(".part")
        || rest.ends_with(".ytdl")
        || rest.contains(".part-Frag")
        || rest.contains(".temp.")
    {
        return true;
    }
    // ".f137.mp4" style per-format intermediate
    rest.strip_prefix(".f")
        .and_then(|r| r.split_once('.'))
        .is_some_and(|(fmt, _)| {
            !fmt.is_empty() && fmt.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
}

#[cfg(test)]
mod tests {
    use super::is_partial;

    #[test]
    fn recognises_partial_files() {
        let id = "BaW_jenozKc";
        assert!(is_partial("test [BaW_jenozKc].mp4.part", id));
        assert!(is_partial("test [BaW_jenozKc].f137.mp4", id));
        assert!(is_partial("test [BaW_jenozKc].f251-drc.webm.part", id));
        assert!(is_partial("test [BaW_jenozKc].mp4.ytdl", id));
        assert!(is_partial("test [BaW_jenozKc].temp.mp4", id));
        assert!(is_partial("test [BaW_jenozKc].f137.mp4.part-Frag3", id));
        // finished files and other videos are kept
        assert!(!is_partial("test [BaW_jenozKc].mp4", id));
        assert!(!is_partial("test [BaW_jenozKc].mp3", id));
        assert!(!is_partial("fancy [other].f137.mp4", id));
        assert!(!is_partial("random.part", id));
    }
}
