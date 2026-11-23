//! Everything specific to yt-dlp: turning user options into arguments,
//! probing URLs, and parsing its machine-readable progress output.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Prefix that marks lines Grabbit asked yt-dlp to print.
const TAG: &str = "GRB|";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Video,
    Audio,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoContainer {
    /// Most compatible: prefers H.264/AAC at each resolution.
    Mp4,
    /// Best quality: any codec (VP9/AV1/Opus), stored in Matroska.
    Mkv,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    M4a,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    pub mode: Mode,
    /// Maximum video height (e.g. 1080). `None` = best available.
    pub max_height: Option<u32>,
    pub video_container: VideoContainer,
    pub audio_format: AudioFormat,
    pub subtitles: bool,
    pub auto_subtitles: bool,
    /// yt-dlp `--sub-langs` value, e.g. "en.*,pt.*".
    pub sub_langs: String,
    pub embed_metadata: bool,
    pub output_dir: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistContext {
    pub title: String,
    /// 1-based position in the playlist.
    pub index: u32,
}

/// Paths to the helper tools passed to yt-dlp.
#[derive(Default)]
pub struct Tools<'a> {
    pub ffmpeg: Option<&'a Path>,
    pub deno: Option<&'a Path>,
}

/// Make a string safe to use as a literal inside a yt-dlp output template
/// and as a single folder name on every OS.
pub fn sanitize_folder(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']).to_string();
    let limited: String = trimmed.chars().take(120).collect();
    let safe = if limited.is_empty() {
        "Playlist".to_string()
    } else {
        limited
    };
    safe.replace('%', "%%")
}

/// Build the full yt-dlp argument list for one download.
pub fn build_args(
    url: &str,
    opts: &DownloadOptions,
    playlist: Option<&PlaylistContext>,
    tools: &Tools,
) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    let mut push = |items: &[&str]| a.extend(items.iter().map(|s| s.to_string()));

    // Machine-readable output.
    push(&["--newline", "--progress", "--progress-delta", "0.25"]);
    push(&[
        "--progress-template",
        "download:GRB|dl|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
    ]);
    push(&[
        "--progress-template",
        "postprocess:GRB|pp|%(progress.status)s|%(progress.postprocessor)s",
    ]);
    push(&["--print", "after_move:GRB|file|%(filepath)s"]);

    // Files.
    push(&[
        "--no-playlist",
        "--windows-filenames",
        "--no-mtime",
        "--no-overwrites",
        "--continue",
    ]);
    push(&["-P", &opts.output_dir]);
    let name = "%(title).180B [%(id)s].%(ext)s";
    let template = match playlist {
        Some(p) => format!("{}/{:03} - {name}", sanitize_folder(&p.title), p.index),
        None => name.to_string(),
    };
    push(&["-o", &template]);

    // Formats.
    match opts.mode {
        Mode::Video => {
            let mut sort = Vec::new();
            if let Some(h) = opts.max_height {
                sort.push(format!("res:{h}"));
            }
            let container = match opts.video_container {
                VideoContainer::Mp4 => {
                    sort.push("vcodec:h264".into());
                    sort.push("acodec:aac".into());
                    "mp4"
                }
                VideoContainer::Mkv => "mkv",
            };
            push(&["-f", "bv*+ba/b"]);
            if !sort.is_empty() {
                push(&["-S", &sort.join(",")]);
            }
            push(&[
                "--merge-output-format",
                container,
                "--remux-video",
                container,
            ]);

            if opts.subtitles {
                push(&["--write-subs"]);
                if opts.auto_subtitles {
                    push(&["--write-auto-subs"]);
                }
                let langs = if opts.sub_langs.trim().is_empty() {
                    "en.*"
                } else {
                    opts.sub_langs.trim()
                };
                push(&["--sub-langs", langs, "--embed-subs"]);
            }
        }
        Mode::Audio => {
            let (format, fmt) = match opts.audio_format {
                AudioFormat::Mp3 => ("ba/b", "mp3"),
                AudioFormat::M4a => ("ba[ext=m4a]/ba/b", "m4a"),
            };
            push(&[
                "-f",
                format,
                "-x",
                "--audio-format",
                fmt,
                "--audio-quality",
                "0",
            ]);
        }
    }

    if opts.embed_metadata {
        push(&["--embed-metadata", "--embed-thumbnail", "--embed-chapters"]);
    }

    if let Some(ffmpeg) = tools.ffmpeg {
        push(&["--ffmpeg-location", &ffmpeg.to_string_lossy()]);
    }
    if let Some(deno) = tools.deno {
        push(&["--js-runtimes", &format!("deno:{}", deno.to_string_lossy())]);
    }

    // `--` stops a URL that starts with "-" from being read as an option.
    push(&["--", url]);
    a
}

/// Arguments for probing a URL (metadata only, no download).
pub fn probe_args(url: &str, tools: &Tools) -> (String, Vec<String>) {
    let url = normalize_probe_url(url);
    let mut a = vec![
        "-J".to_string(),
        "--flat-playlist".into(),
        "--no-warnings".into(),
    ];
    // A watch URL that also carries &list= means "this video", not the playlist.
    if url.contains("v=") || url.contains("youtu.be/") {
        a.push("--no-playlist".into());
    }
    if let Some(deno) = tools.deno {
        a.push("--js-runtimes".into());
        a.push(format!("deno:{}", deno.to_string_lossy()));
    }
    a.push("--".into());
    a.push(url.clone());
    (url, a)
}

/// A bare channel URL lists its tabs (Videos, Shorts, Live…) as nested
/// playlists; point it at the Videos tab so the user gets actual videos.
fn normalize_probe_url(url: &str) -> String {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !lower.contains("youtube.com/") {
        return trimmed.to_string();
    }
    let (base, query) = match trimmed.split_once('?') {
        Some((b, q)) => (b.trim_end_matches('/'), Some(q)),
        None => (trimmed.trim_end_matches('/'), None),
    };
    let path = base.split_once("youtube.com").map(|(_, p)| p).unwrap_or("");
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let is_channel_root = match segs.as_slice() {
        [handle] => handle.starts_with('@'),
        ["channel" | "c" | "user", _] => true,
        _ => false,
    };
    if is_channel_root {
        match query {
            Some(q) => format!("{base}/videos?{q}"),
            None => format!("{base}/videos"),
        }
    } else {
        trimmed.to_string()
    }
}

// ---------------------------------------------------------------------------
// Probe results
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ProbeResult {
    #[serde(rename_all = "camelCase")]
    Video {
        id: String,
        url: String,
        title: String,
        uploader: Option<String>,
        thumbnail: Option<String>,
        duration: Option<f64>,
        /// Distinct video heights available, highest first.
        heights: Vec<u32>,
        subtitle_langs: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    Playlist {
        id: String,
        url: String,
        title: String,
        uploader: Option<String>,
        entries: Vec<PlaylistEntry>,
    },
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    /// 1-based position in the playlist.
    pub index: u32,
}

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn best_thumbnail(v: &Value) -> Option<String> {
    s(v, "thumbnail").or_else(|| {
        v.get("thumbnails")?
            .as_array()?
            .iter()
            .rev()
            .find_map(|t| s(t, "url"))
    })
}

pub fn parse_probe(json: &str, requested_url: &str) -> Result<ProbeResult, String> {
    let v: Value =
        serde_json::from_str(json).map_err(|e| format!("Unexpected yt-dlp output: {e}"))?;
    let id = s(&v, "id").unwrap_or_default();
    let title = s(&v, "title").unwrap_or_else(|| "Untitled".into());
    let uploader = s(&v, "uploader").or_else(|| s(&v, "channel"));
    let url = s(&v, "webpage_url").unwrap_or_else(|| requested_url.to_string());

    if v.get("_type").and_then(Value::as_str) == Some("playlist") {
        let entries = v
            .get("entries")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter(|e| !e.is_null())
                    .filter_map(|e| {
                        let id = s(e, "id")?;
                        let url = s(e, "url")
                            .filter(|u| u.starts_with("http"))
                            .or_else(|| s(e, "webpage_url"))
                            .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={id}"));
                        Some((id, url, e))
                    })
                    .enumerate()
                    .map(|(i, (id, url, e))| PlaylistEntry {
                        title: s(e, "title").unwrap_or_else(|| id.clone()),
                        duration: e.get("duration").and_then(Value::as_f64),
                        thumbnail: best_thumbnail(e),
                        index: e
                            .get("playlist_index")
                            .and_then(Value::as_u64)
                            .map(|n| n as u32)
                            .unwrap_or(i as u32 + 1),
                        id,
                        url,
                    })
                    .collect()
            })
            .unwrap_or_default();
        return Ok(ProbeResult::Playlist {
            id,
            url,
            title,
            uploader,
            entries,
        });
    }

    let mut heights: Vec<u32> = v
        .get("formats")
        .and_then(Value::as_array)
        .map(|fs| {
            fs.iter()
                .filter(|f| {
                    f.get("vcodec")
                        .and_then(Value::as_str)
                        .is_some_and(|c| c != "none")
                })
                .filter_map(|f| f.get("height").and_then(Value::as_u64))
                .map(|h| h as u32)
                .collect()
        })
        .unwrap_or_default();
    heights.sort_unstable_by(|a, b| b.cmp(a));
    heights.dedup();

    let mut subtitle_langs: Vec<String> = v
        .get("subtitles")
        .and_then(Value::as_object)
        .map(|m| m.keys().filter(|k| *k != "live_chat").cloned().collect())
        .unwrap_or_default();
    subtitle_langs.sort();

    Ok(ProbeResult::Video {
        id,
        url,
        title,
        uploader,
        thumbnail: best_thumbnail(&v),
        duration: v.get("duration").and_then(Value::as_f64),
        heights,
        subtitle_langs,
    })
}

// ---------------------------------------------------------------------------
// Progress output
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Download {
        status: String,
        downloaded: Option<u64>,
        total: Option<u64>,
        speed: Option<f64>,
        eta: Option<u64>,
    },
    PostProcess {
        status: String,
        name: String,
    },
    File(String),
}

fn num(s: &str) -> Option<f64> {
    s.trim()
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite() && *n >= 0.0)
}

/// Parse one line of yt-dlp output. Returns `None` for lines Grabbit didn't
/// ask for (warnings, info messages…).
pub fn parse_line(line: &str) -> Option<Event> {
    let rest = line
        .trim_end_matches(['\r', '\n'])
        .trim_start()
        .strip_prefix(TAG)?;
    let (kind, rest) = rest.split_once('|')?;
    match kind {
        "dl" => {
            let f: Vec<&str> = rest.split('|').collect();
            if f.len() < 6 {
                return None;
            }
            let total = num(f[2]).or_else(|| num(f[3])).map(|n| n as u64);
            Some(Event::Download {
                status: f[0].to_string(),
                downloaded: num(f[1]).map(|n| n as u64),
                total,
                speed: num(f[4]),
                eta: num(f[5]).map(|n| n as u64),
            })
        }
        "pp" => {
            let (status, name) = rest.split_once('|')?;
            Some(Event::PostProcess {
                status: status.into(),
                name: name.into(),
            })
        }
        // A file path may itself contain '|', so take the rest verbatim.
        "file" => Some(Event::File(rest.to_string())),
        _ => None,
    }
}

/// Human-readable label for a yt-dlp postprocessor.
/// Stage code for a yt-dlp postprocessor; the UI turns it into text.
pub fn postprocessor_label(name: &str) -> String {
    format!("pp:{name}")
}

/// Turn yt-dlp's stderr into one user-facing message.
///
/// Known problems come back as `E:<code>` (or `E:<code>:<detail>`), which the
/// UI translates (see `src/i18n`); anything else is yt-dlp's own message.
pub fn friendly_error(log: &[String], exit_code: Option<i32>) -> String {
    let last_error = log.iter().rev().find(|l| l.starts_with("ERROR:"));
    let Some(line) = last_error else {
        return match exit_code {
            Some(c) => format!("E:exit_code:{c}"),
            None => "E:stopped".into(),
        };
    };
    let lower = line.to_lowercase();
    let known = [
        ("private video", "E:private"),
        ("not a bot", "E:bot_check"),
        ("confirm your age", "E:age_restricted"),
        ("members-only", "E:members_only"),
        ("join this channel", "E:members_only"),
        ("video unavailable", "E:unavailable"),
        ("is not available in your country", "E:region_blocked"),
        ("premieres in", "E:not_premiered"),
        ("this live event will begin", "E:live_not_started"),
        ("ffmpeg not found", "E:ffmpeg_missing"),
        ("ffprobe and ffmpeg not found", "E:ffmpeg_missing"),
        ("unsupported url", "E:unsupported_url"),
        ("unable to download webpage", "E:offline"),
        ("no space left on device", "E:disk_full"),
        ("permission denied", "E:no_write_permission"),
        ("http error 403", "E:http_403"),
        ("requested format is not available", "E:format_unavailable"),
    ];
    if let Some((_, msg)) = known.iter().find(|(needle, _)| lower.contains(needle)) {
        return msg.to_string();
    }
    // "ERROR: [youtube] abc123: Something went wrong" → "Something went wrong"
    let msg = line.trim_start_matches("ERROR:").trim();
    let msg = match msg.strip_prefix('[') {
        Some(rest) => rest.split_once("] ").map(|(_, r)| r).unwrap_or(rest),
        None => msg,
    };
    let msg = match msg.split_once(": ") {
        Some((head, tail)) if !head.contains(' ') && head.len() <= 20 => tail,
        _ => msg,
    };
    msg.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> DownloadOptions {
        DownloadOptions {
            mode: Mode::Video,
            max_height: Some(1080),
            video_container: VideoContainer::Mp4,
            audio_format: AudioFormat::Mp3,
            subtitles: false,
            auto_subtitles: false,
            sub_langs: String::new(),
            embed_metadata: true,
            output_dir: "/Users/me/Downloads".into(),
        }
    }

    fn after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        args.iter()
            .position(|a| a == flag)
            .map(|i| args[i + 1].as_str())
    }

    #[test]
    fn video_args() {
        let ffmpeg = Path::new("/bin/dir/ffmpeg");
        let deno = Path::new("/bin/dir/deno");
        let a = build_args(
            "https://youtu.be/x",
            &opts(),
            None,
            &Tools {
                ffmpeg: Some(ffmpeg),
                deno: Some(deno),
            },
        );
        assert_eq!(after(&a, "-f"), Some("bv*+ba/b"));
        assert_eq!(after(&a, "-S"), Some("res:1080,vcodec:h264,acodec:aac"));
        assert_eq!(after(&a, "--merge-output-format"), Some("mp4"));
        assert_eq!(after(&a, "-P"), Some("/Users/me/Downloads"));
        assert_eq!(after(&a, "-o"), Some("%(title).180B [%(id)s].%(ext)s"));
        assert_eq!(after(&a, "--ffmpeg-location"), Some("/bin/dir/ffmpeg"));
        assert_eq!(after(&a, "--js-runtimes"), Some("deno:/bin/dir/deno"));
        assert!(a.contains(&"--embed-thumbnail".to_string()));
        assert!(!a.contains(&"-x".to_string()));
        assert!(!a.contains(&"--write-subs".to_string()));
        // URL always last, behind `--`
        assert_eq!(&a[a.len() - 2..], ["--", "https://youtu.be/x"]);
    }

    #[test]
    fn best_quality_mkv_with_subs() {
        let o = DownloadOptions {
            max_height: None,
            video_container: VideoContainer::Mkv,
            subtitles: true,
            auto_subtitles: true,
            sub_langs: "en.*,pt-BR".into(),
            embed_metadata: false,
            ..opts()
        };
        let a = build_args("u", &o, None, &Tools::default());
        assert_eq!(after(&a, "-S"), None);
        assert_eq!(after(&a, "--merge-output-format"), Some("mkv"));
        assert_eq!(after(&a, "--sub-langs"), Some("en.*,pt-BR"));
        assert!(a.contains(&"--write-auto-subs".to_string()));
        assert!(a.contains(&"--embed-subs".to_string()));
        assert!(!a.contains(&"--embed-metadata".to_string()));
        assert!(!a.contains(&"--ffmpeg-location".to_string()));
    }

    #[test]
    fn audio_args_ignore_video_only_options() {
        let o = DownloadOptions {
            mode: Mode::Audio,
            audio_format: AudioFormat::M4a,
            subtitles: true,
            ..opts()
        };
        let a = build_args("u", &o, None, &Tools::default());
        assert_eq!(after(&a, "-f"), Some("ba[ext=m4a]/ba/b"));
        assert_eq!(after(&a, "--audio-format"), Some("m4a"));
        assert!(a.contains(&"-x".to_string()));
        assert!(!a.contains(&"--write-subs".to_string()));
        assert!(!a.contains(&"-S".to_string()));
    }

    #[test]
    fn playlist_items_go_into_a_sanitized_folder() {
        let p = PlaylistContext {
            title: "Mix: 100% <Hits>/2026".into(),
            index: 7,
        };
        let a = build_args("u", &opts(), Some(&p), &Tools::default());
        assert_eq!(
            after(&a, "-o"),
            Some("Mix_ 100%% _Hits__2026/007 - %(title).180B [%(id)s].%(ext)s")
        );
        assert_eq!(sanitize_folder("  ...  "), "Playlist");
        assert_eq!(sanitize_folder("Trailing dots..."), "Trailing dots");
    }

    #[test]
    fn probe_args_and_channel_urls() {
        let (u, a) = probe_args(
            "https://www.youtube.com/watch?v=abc&list=PL1",
            &Tools::default(),
        );
        assert_eq!(u, "https://www.youtube.com/watch?v=abc&list=PL1");
        assert!(a.contains(&"--no-playlist".to_string()));
        let (u, a) = probe_args(
            "https://www.youtube.com/playlist?list=PL1",
            &Tools::default(),
        );
        assert_eq!(u, "https://www.youtube.com/playlist?list=PL1");
        assert!(!a.contains(&"--no-playlist".to_string()));
        assert_eq!(
            probe_args("https://www.youtube.com/@someone/", &Tools::default()).0,
            "https://www.youtube.com/@someone/videos"
        );
        assert_eq!(
            probe_args("https://youtube.com/channel/UC123", &Tools::default()).0,
            "https://youtube.com/channel/UC123/videos"
        );
        assert_eq!(
            probe_args("https://www.youtube.com/@someone/shorts", &Tools::default()).0,
            "https://www.youtube.com/@someone/shorts"
        );
        assert_eq!(
            probe_args("https://vimeo.com/@x", &Tools::default()).0,
            "https://vimeo.com/@x"
        );
    }

    #[test]
    fn parses_progress_lines() {
        assert_eq!(
            parse_line("GRB|dl|downloading|1048576|NA|4194304.5|250000.25|12"),
            Some(Event::Download {
                status: "downloading".into(),
                downloaded: Some(1048576),
                total: Some(4194304),
                speed: Some(250000.25),
                eta: Some(12),
            })
        );
        assert_eq!(
            parse_line("GRB|dl|finished|5000|5000|NA|NA|NA\r"),
            Some(Event::Download {
                status: "finished".into(),
                downloaded: Some(5000),
                total: Some(5000),
                speed: None,
                eta: None
            })
        );
        assert_eq!(
            parse_line("GRB|pp|started|Merger"),
            Some(Event::PostProcess {
                status: "started".into(),
                name: "Merger".into()
            })
        );
        assert_eq!(
            parse_line("GRB|file|/a/b|c [x].mp4"),
            Some(Event::File("/a/b|c [x].mp4".into()))
        );
        assert_eq!(parse_line("[youtube] abc: Downloading webpage"), None);
        assert_eq!(parse_line("GRB|dl|downloading|1"), None);
    }

    #[test]
    fn parses_video_probe() {
        let json = r#"{"id":"BaW_jenozKc","title":"test video","uploader":"Phihag","webpage_url":"https://www.youtube.com/watch?v=BaW_jenozKc",
            "thumbnail":"https://i.ytimg.com/x.jpg","duration":10,
            "formats":[{"vcodec":"none","height":null},{"vcodec":"avc1","height":360},{"vcodec":"vp9","height":720},{"vcodec":"avc1","height":720}],
            "subtitles":{"en":[],"live_chat":[],"de":[]}}"#;
        match parse_probe(json, "u").unwrap() {
            ProbeResult::Video {
                id,
                heights,
                subtitle_langs,
                duration,
                ..
            } => {
                assert_eq!(id, "BaW_jenozKc");
                assert_eq!(heights, vec![720, 360]);
                assert_eq!(subtitle_langs, vec!["de", "en"]);
                assert_eq!(duration, Some(10.0));
            }
            other => panic!("expected video, got {other:?}"),
        }
    }

    #[test]
    fn parses_flat_playlist_probe() {
        let json = r#"{"_type":"playlist","id":"PL1","title":"My list","entries":[
            {"id":"a1","url":"https://www.youtube.com/watch?v=a1","title":"One","duration":61.0,"thumbnails":[{"url":"t1s"},{"url":"t1l"}]},
            null,
            {"id":"b2","url":"b2","title":"Two"}]}"#;
        match parse_probe(json, "https://www.youtube.com/playlist?list=PL1").unwrap() {
            ProbeResult::Playlist {
                title,
                entries,
                url,
                ..
            } => {
                assert_eq!(title, "My list");
                assert_eq!(url, "https://www.youtube.com/playlist?list=PL1");
                assert_eq!(entries.len(), 2);
                assert_eq!(entries[0].thumbnail.as_deref(), Some("t1l"));
                assert_eq!(entries[1].url, "https://www.youtube.com/watch?v=b2");
                assert_eq!(entries[1].index, 2);
            }
            other => panic!("expected playlist, got {other:?}"),
        }
    }

    #[test]
    fn friendly_errors() {
        let log = |l: &str| vec!["[youtube] x: Downloading".to_string(), l.to_string()];
        assert_eq!(
            friendly_error(
                &log("ERROR: [youtube] abc: Private video. Sign in"),
                Some(1)
            ),
            "E:private"
        );
        assert_eq!(
            friendly_error(
                &log("ERROR: [youtube] abc: Sign in to confirm you're not a bot."),
                Some(1)
            ),
            "E:bot_check"
        );
        assert_eq!(
            friendly_error(
                &log("ERROR: [generic] abc: Something odd happened"),
                Some(1)
            ),
            "Something odd happened"
        );
        assert_eq!(
            friendly_error(&[], Some(2)),
            "E:exit_code:2"
        );
        assert_eq!(friendly_error(&[], None), "E:stopped");
        assert_eq!(postprocessor_label("Merger"), "pp:Merger");
    }
}
