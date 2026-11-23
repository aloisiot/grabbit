//! The `#[tauri::command]` surface the React UI calls.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::binaries::{self, Component, ComponentStatus};
use crate::history::{self, HistoryEntry};
use crate::process;
use crate::queue::{self, EnqueueItem, Job};
use crate::ytdlp::{self, ProbeResult};

// ----- components ----------------------------------------------------------

#[tauri::command]
pub async fn deps_status(app: AppHandle, versions: Option<bool>) -> Vec<ComponentStatus> {
    binaries::status(&app, versions.unwrap_or(true)).await
}

static INSTALLING: AtomicBool = AtomicBool::new(false);

/// Clears the "install running" flag however the install ends.
struct InstallGuard;
impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}

/// Install (or reinstall/update) the given components, or every missing one.
/// Components download in parallel; per-component progress arrives as
/// `deps://progress` events.
#[tauri::command]
pub async fn deps_install(app: AppHandle, components: Option<Vec<String>>) -> Result<(), String> {
    if queue::has_active(&app) {
        return Err("E:busy_downloading".into());
    }
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("E:already_installing".into());
    }
    let _guard = InstallGuard;

    let wanted: Vec<Component> = match components {
        Some(ids) => ids.iter().filter_map(|id| Component::from_id(id)).collect(),
        // Only a file check here: running each tool for its version is slow.
        None => Component::ALL
            .into_iter()
            .filter(|c| binaries::find_executable(&app, c.executables()[0]).is_none())
            .collect(),
    };
    binaries::announce_queued(&app, &wanted);

    let results =
        futures_util::future::join_all(wanted.iter().map(|c| binaries::install(&app, *c))).await;
    // Each component's own error is on its progress row; this names the failures.
    let failed: Vec<&str> = wanted
        .iter()
        .zip(results)
        .filter_map(|(c, r)| r.err().map(|_| c.id()))
        .collect();
    if failed.is_empty() {
        Ok(())
    } else {
        Err(format!("E:install_failed:{}", failed.join(", ")))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current: Option<String>,
    latest: String,
    update_available: bool,
    /// Only Grabbit-managed copies can be updated from the app.
    managed: bool,
}

#[tauri::command]
pub async fn ytdlp_check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let latest = binaries::latest_ytdlp_version().await?;
    let found = binaries::find_executable(&app, "yt-dlp");
    let current = match &found {
        Some((p, _)) => binaries::version_of(p, Component::YtDlp).await,
        None => None,
    };
    let update_available = current
        .as_deref()
        .is_none_or(|c| binaries::version_newer(&latest, c));
    Ok(UpdateInfo {
        current,
        latest,
        update_available,
        managed: found.is_some_and(|(_, m)| m),
    })
}

// ----- probing -------------------------------------------------------------

#[tauri::command]
pub async fn probe(app: AppHandle, url: String) -> Result<ProbeResult, String> {
    let url = url.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("E:invalid_url".into());
    }
    let (ytdlp_path, _) = binaries::find_executable(&app, "yt-dlp").ok_or("E:ytdlp_missing")?;
    let deno = binaries::find_executable(&app, "deno").map(|(p, _)| p);
    let tools = ytdlp::Tools {
        ffmpeg: None,
        deno: deno.as_deref(),
    };
    let (normalized, args) = ytdlp::probe_args(&url, &tools);

    let mut cmd = process::command(&ytdlp_path);
    cmd.args(&args)
        .env("PATH", binaries::child_path(&app))
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .kill_on_drop(true);
    let out = tokio::time::timeout(std::time::Duration::from_secs(180), cmd.output())
        .await
        .map_err(|_| "E:probe_timeout".to_string())?
        .map_err(|e| format!("E:ytdlp_start_failed:{e}"))?;

    if !out.status.success() {
        let log: Vec<String> = String::from_utf8_lossy(&out.stderr)
            .lines()
            .map(str::to_string)
            .collect();
        return Err(ytdlp::friendly_error(&log, out.status.code()));
    }
    ytdlp::parse_probe(&String::from_utf8_lossy(&out.stdout), &normalized)
}

// ----- queue ---------------------------------------------------------------

#[tauri::command]
pub fn enqueue(app: AppHandle, items: Vec<EnqueueItem>) -> Vec<Job> {
    queue::enqueue(&app, items)
}

#[tauri::command]
pub fn list_jobs(app: AppHandle) -> Vec<Job> {
    queue::list(&app)
}

#[tauri::command]
pub fn cancel_job(app: AppHandle, id: String) {
    queue::cancel(&app, &id)
}

#[tauri::command]
pub fn retry_job(app: AppHandle, id: String) {
    queue::retry(&app, &id)
}

#[tauri::command]
pub fn remove_job(app: AppHandle, id: String) {
    queue::remove(&app, Some(&id))
}

#[tauri::command]
pub fn clear_finished(app: AppHandle) {
    queue::remove(&app, None)
}

#[tauri::command]
pub fn set_concurrency(app: AppHandle, n: usize) {
    queue::set_concurrency(&app, n)
}

// ----- history -------------------------------------------------------------

#[tauri::command]
pub fn history_list(app: AppHandle) -> Vec<HistoryEntry> {
    history::list(&app)
}

#[tauri::command]
pub fn history_remove(app: AppHandle, id: String) -> Result<(), String> {
    history::remove(&app, &id)
}

#[tauri::command]
pub fn history_clear(app: AppHandle) -> Result<(), String> {
    history::clear(&app)
}

// ----- files ---------------------------------------------------------------

#[tauri::command]
pub fn default_download_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_file(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        app.opener()
            .reveal_item_in_dir(p)
            .map_err(|e| e.to_string())
    } else {
        // File moved/deleted: open the folder it was in, if that still exists.
        match p.parent().filter(|d| d.exists()) {
            Some(dir) => app
                .opener()
                .open_path(dir.to_string_lossy(), None::<&str>)
                .map_err(|e| e.to_string()),
            None => Err("E:file_missing".into()),
        }
    }
}

const REPOSITORY_URL: &str = "https://github.com/aloisiot/grabbit";

/// URL for one of the project's pages. Only these fixed pages can be opened:
/// the webview never passes a URL of its own.
fn project_link(kind: &str) -> Option<String> {
    match kind {
        "repository" => Some(REPOSITORY_URL.to_string()),
        "issues" => Some(format!("{REPOSITORY_URL}/issues")),
        "releases" => Some(format!("{REPOSITORY_URL}/releases")),
        _ => None,
    }
}

/// Open one of the project's pages (About section) in the default browser.
#[tauri::command]
pub fn open_link(app: AppHandle, kind: String) -> Result<(), String> {
    let url = project_link(&kind).ok_or_else(|| format!("Unknown link: {kind}"))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::project_link;

    #[test]
    fn only_fixed_project_links_open() {
        assert_eq!(
            project_link("repository").as_deref(),
            Some("https://github.com/aloisiot/grabbit")
        );
        assert_eq!(
            project_link("issues").as_deref(),
            Some("https://github.com/aloisiot/grabbit/issues")
        );
        assert_eq!(
            project_link("releases").as_deref(),
            Some("https://github.com/aloisiot/grabbit/releases")
        );
        assert_eq!(project_link("https://example.com"), None);
        assert_eq!(project_link(""), None);
    }
}
