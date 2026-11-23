//! Locating, downloading, verifying and updating the external tools Grabbit
//! drives: yt-dlp, ffmpeg (+ ffprobe) and Deno (yt-dlp's JavaScript runtime
//! for YouTube).
//!
//! Managed copies live in `<app data>/bin`. If a tool isn't managed, the
//! system PATH (plus common install dirs that macOS GUI apps don't inherit)
//! is searched as a fallback.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::process;

pub const USER_AGENT: &str = concat!("Grabbit/", env!("CARGO_PKG_VERSION"));

/// Pinned macOS ffmpeg builds (static, from ffmpeg.martin-riedl.de). The
/// FFmpeg project publishes no official binaries and yt-dlp's FFmpeg-Builds
/// don't cover macOS. Bump these when a new release is published there.
const MACOS_FFMPEG_ARM64: &str =
    "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2";
const MACOS_FFMPEG_AMD64: &str =
    "https://ffmpeg.martin-riedl.de/download/macos/amd64/1789931006_9.0.2";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Component {
    YtDlp,
    Ffmpeg,
    Deno,
}

impl Component {
    pub const ALL: [Component; 3] = [Component::YtDlp, Component::Ffmpeg, Component::Deno];

    pub fn id(self) -> &'static str {
        match self {
            Component::YtDlp => "yt-dlp",
            Component::Ffmpeg => "ffmpeg",
            Component::Deno => "deno",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|c| c.id() == id)
    }

    /// Executables this component provides (without `.exe`).
    pub fn executables(self) -> &'static [&'static str] {
        match self {
            Component::YtDlp => &["yt-dlp"],
            Component::Ffmpeg => &["ffmpeg", "ffprobe"],
            Component::Deno => &["deno"],
        }
    }
}

/// Platform-specific executable file name.
pub fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

pub fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("bin"))
        .map_err(|e| format!("Can't resolve the app data folder: {e}"))
}

/// Directories searched for system-installed tools, in priority order.
fn system_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    for d in extra_dirs() {
        if !dirs.contains(&d) {
            dirs.push(d);
        }
    }
    dirs
}

/// Common install locations that GUI apps don't get in PATH (notably macOS,
/// where apps launched from Finder or the Dock don't inherit the shell's PATH).
#[cfg(unix)]
fn extra_dirs() -> Vec<PathBuf> {
    let mut extra = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        extra.push(home.join(".local/bin"));
        extra.push(home.join(".deno/bin"));
    }
    extra
}

/// Windows GUI apps get the full user PATH, so nothing extra is needed.
#[cfg(not(unix))]
fn extra_dirs() -> Vec<PathBuf> {
    Vec::new()
}

/// Find an executable: managed copy first, then the system.
/// Returns the path and whether it is the managed copy.
pub fn find_executable(app: &AppHandle, name: &str) -> Option<(PathBuf, bool)> {
    if let Ok(dir) = bin_dir(app) {
        let managed = dir.join(exe(name));
        if managed.is_file() {
            return Some((managed, true));
        }
    }
    system_dirs()
        .into_iter()
        .map(|d| d.join(exe(name)))
        .find(|p| p.is_file())
        .map(|p| (p, false))
}

/// PATH for child processes: managed bin dir first, then the system dirs.
pub fn child_path(app: &AppHandle) -> OsString {
    let mut dirs = Vec::new();
    if let Ok(d) = bin_dir(app) {
        dirs.push(d);
    }
    dirs.extend(system_dirs());
    std::env::join_paths(dirs).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Status / versions
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ComponentStatus {
    pub id: &'static str,
    pub installed: bool,
    pub managed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    /// Required for downloads to work at all (deno is strongly recommended).
    pub required: bool,
}

/// `with_versions` runs each tool once to read its version (slower).
pub async fn status(app: &AppHandle, with_versions: bool) -> Vec<ComponentStatus> {
    // Version checks run in parallel: a freshly downloaded yt-dlp can take a
    // few seconds on its first run.
    futures_util::future::join_all(Component::ALL.into_iter().map(|c| async move {
        let found = find_executable(app, c.executables()[0]);
        let version = match &found {
            Some((p, _)) if with_versions => version_of(p, c).await,
            _ => None,
        };
        ComponentStatus {
            id: c.id(),
            installed: found.is_some(),
            managed: found.as_ref().is_some_and(|(_, m)| *m),
            path: found.map(|(p, _)| p.to_string_lossy().into_owned()),
            version,
            required: c != Component::Deno,
        }
    }))
    .await
}

pub async fn version_of(path: &Path, c: Component) -> Option<String> {
    let arg = if c == Component::Ffmpeg {
        "-version"
    } else {
        "--version"
    };
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        process::command(path).arg(arg).output(),
    )
    .await
    .ok()?
    .ok()?;
    parse_version(c, &String::from_utf8_lossy(&out.stdout))
}

fn parse_version(c: Component, stdout: &str) -> Option<String> {
    let line = stdout.lines().find(|l| !l.trim().is_empty())?.trim();
    let v = match c {
        // "2026.10.26"
        Component::YtDlp => line.split_whitespace().next(),
        // "ffmpeg version 9.0.2 Copyright ..." / "ffmpeg version N-1234-gabc ..."
        Component::Ffmpeg => line.split_whitespace().nth(2),
        // "deno 2.9.8 (stable, release, aarch64-apple-darwin)"
        Component::Deno => line.split_whitespace().nth(1),
    }?;
    Some(v.to_string())
}

/// Compare dotted numeric versions ("2026.10.26" vs "2026.9.1.123").
/// Non-numeric parts compare as 0.
pub fn version_newer(candidate: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v')
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    let (a, b) = (parse(candidate), parse(current));
    let n = a.len().max(b.len());
    for i in 0..n {
        let (x, y) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x > y;
        }
    }
    false
}

pub async fn latest_ytdlp_version() -> Result<String, String> {
    #[derive(serde::Deserialize)]
    struct Release {
        tag_name: String,
    }
    let release: Release = http_client()?
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("E:github_unreachable:{e}"))?
        .json()
        .await
        .map_err(|e| format!("Unexpected GitHub response: {e}"))?;
    Ok(release.tag_name)
}

// ---------------------------------------------------------------------------
// Download sources
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Archive {
    /// The download *is* the executable.
    Raw,
    Zip,
    TarXz,
}

#[derive(Clone, Debug)]
struct Asset {
    url: String,
    /// URL of a `<sha256>  <file name>` checksum list.
    sums_url: String,
    /// File name to look up in the checksum list.
    sums_name: String,
    archive: Archive,
    /// Executables (without `.exe`) to take from this asset.
    members: Vec<&'static str>,
}

fn unsupported() -> String {
    format!(
        "E:unsupported_platform:{} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

fn assets(c: Component) -> Result<Vec<Asset>, String> {
    assets_for(c, std::env::consts::OS, std::env::consts::ARCH)
}

fn assets_for(c: Component, os: &str, arch: &str) -> Result<Vec<Asset>, String> {
    let arm = arch == "aarch64";
    match c {
        Component::YtDlp => {
            let name = match os {
                "macos" => "yt-dlp_macos",
                "windows" if arm => "yt-dlp_arm64.exe",
                "windows" => "yt-dlp.exe",
                "linux" if arm => "yt-dlp_linux_aarch64",
                "linux" => "yt-dlp_linux",
                _ => return Err(unsupported()),
            };
            let base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
            Ok(vec![Asset {
                url: format!("{base}/{name}"),
                sums_url: format!("{base}/SHA2-256SUMS"),
                sums_name: name.into(),
                archive: Archive::Raw,
                members: vec!["yt-dlp"],
            }])
        }
        Component::Deno => {
            let triple = match (os, arm) {
                ("macos", true) => "aarch64-apple-darwin",
                ("macos", false) => "x86_64-apple-darwin",
                ("windows", true) => "aarch64-pc-windows-msvc",
                ("windows", false) => "x86_64-pc-windows-msvc",
                ("linux", true) => "aarch64-unknown-linux-gnu",
                ("linux", false) => "x86_64-unknown-linux-gnu",
                _ => return Err(unsupported()),
            };
            let name = format!("deno-{triple}.zip");
            let url = format!("https://github.com/denoland/deno/releases/latest/download/{name}");
            Ok(vec![Asset {
                sums_url: format!("{url}.sha256sum"),
                url,
                sums_name: name,
                archive: Archive::Zip,
                members: vec!["deno"],
            }])
        }
        Component::Ffmpeg => match os {
            "macos" => {
                let base = if arm {
                    MACOS_FFMPEG_ARM64
                } else {
                    MACOS_FFMPEG_AMD64
                };
                Ok(["ffmpeg", "ffprobe"]
                    .into_iter()
                    .map(|tool| Asset {
                        url: format!("{base}/{tool}.zip"),
                        sums_url: format!("{base}/{tool}.zip.sha256"),
                        sums_name: format!("{tool}.zip"),
                        archive: Archive::Zip,
                        members: vec![tool],
                    })
                    .collect())
            }
            "windows" | "linux" => {
                let (name, archive) = match (os, arm) {
                    ("windows", true) => ("ffmpeg-master-latest-winarm64-gpl.zip", Archive::Zip),
                    ("windows", false) => ("ffmpeg-master-latest-win64-gpl.zip", Archive::Zip),
                    (_, true) => ("ffmpeg-master-latest-linuxarm64-gpl.tar.xz", Archive::TarXz),
                    (_, false) => ("ffmpeg-master-latest-linux64-gpl.tar.xz", Archive::TarXz),
                };
                let base = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest";
                Ok(vec![Asset {
                    url: format!("{base}/{name}"),
                    sums_url: format!("{base}/checksums.sha256"),
                    sums_name: name.into(),
                    archive,
                    members: vec!["ffmpeg", "ffprobe"],
                }])
            }
            _ => Err(unsupported()),
        },
    }
}

/// Find `name` in a `sha256sum`-style list (`<hex>  <name>` or `<hex> *<name>`).
fn parse_sums(text: &str, name: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let file = parts.next()?.trim_start_matches('*');
        (file == name && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()))
            .then(|| hash.to_ascii_lowercase())
    })
}

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub component: &'static str,
    /// "queued" | "connecting" | "downloading" | "extracting" | "testing" | "done" | "error"
    pub stage: &'static str,
    /// Bytes downloaded so far, across every file of this component.
    pub downloaded: u64,
    /// Total bytes to download, when the servers report it.
    pub total: Option<u64>,
    /// Smoothed download speed in bytes per second.
    pub speed: Option<f64>,
    /// Version the freshly installed tool reports (stage "done").
    pub version: Option<String>,
    pub path: Option<String>,
    pub error: Option<String>,
}

pub fn emit_progress(app: &AppHandle, p: InstallProgress) {
    let _ = app.emit("deps://progress", p);
}

/// Tracks one component's progress and sends throttled updates to the UI.
struct Reporter<'a> {
    app: &'a AppHandle,
    c: Component,
    downloaded: u64,
    total: Option<u64>,
    speed: Option<f64>,
    window_start: Instant,
    window_bytes: u64,
    last_emit: Instant,
}

impl<'a> Reporter<'a> {
    fn new(app: &'a AppHandle, c: Component) -> Self {
        let now = Instant::now();
        Self {
            app,
            c,
            downloaded: 0,
            total: None,
            speed: None,
            window_start: now,
            window_bytes: 0,
            last_emit: now,
        }
    }

    fn emit(&self, stage: &'static str) {
        emit_progress(
            self.app,
            InstallProgress {
                component: self.c.id(),
                stage,
                downloaded: self.downloaded,
                total: self.total,
                speed: if stage == "downloading" {
                    self.speed
                } else {
                    None
                },
                ..Default::default()
            },
        );
    }

    fn add_bytes(&mut self, n: u64) {
        self.downloaded += n;
        self.window_bytes += n;
        let elapsed = self.window_start.elapsed();
        if elapsed >= Duration::from_millis(300) {
            let instant = self.window_bytes as f64 / elapsed.as_secs_f64();
            self.speed = Some(match self.speed {
                Some(s) => s * 0.6 + instant * 0.4,
                None => instant,
            });
            self.window_start = Instant::now();
            self.window_bytes = 0;
        }
        if self.last_emit.elapsed() >= Duration::from_millis(100) {
            self.last_emit = Instant::now();
            self.emit("downloading");
        }
    }
}

/// Lets the UI show every requested component as waiting right away.
pub fn announce_queued(app: &AppHandle, components: &[Component]) {
    for c in components {
        emit_progress(
            app,
            InstallProgress {
                component: c.id(),
                stage: "queued",
                ..Default::default()
            },
        );
    }
}

/// Download, verify, install and test one component in the managed bin dir.
/// Progress goes to the UI as `deps://progress` events; the final event is
/// "done" (with the tool's version) or "error".
pub async fn install(app: &AppHandle, c: Component) -> Result<(), String> {
    let mut r = Reporter::new(app, c);
    match install_inner(&mut r).await {
        Ok((path, version)) => {
            emit_progress(
                app,
                InstallProgress {
                    component: c.id(),
                    stage: "done",
                    downloaded: r.downloaded,
                    total: r.total,
                    version,
                    path: Some(path.to_string_lossy().into_owned()),
                    ..Default::default()
                },
            );
            Ok(())
        }
        Err(e) => {
            emit_progress(
                app,
                InstallProgress {
                    component: c.id(),
                    stage: "error",
                    error: Some(e.clone()),
                    ..Default::default()
                },
            );
            Err(e)
        }
    }
}

/// Expected checksum and (if known) size of one asset.
async fn prepare(
    client: &reqwest::Client,
    c: Component,
    asset: &Asset,
) -> Result<(String, Option<u64>), String> {
    let sums = async {
        client
            .get(&asset.sums_url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Couldn't fetch checksums for {}: {e}", c.id()))?
            .text()
            .await
            .map_err(|e| e.to_string())
    };
    // Content-Length from a HEAD request; reqwest's content_length() is 0 for HEAD.
    let size = async {
        let resp = client
            .head(&asset.url)
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?;
        resp.headers()
            .get(reqwest::header::CONTENT_LENGTH)?
            .to_str()
            .ok()?
            .parse::<u64>()
            .ok()
    };
    let (sums, size) = tokio::join!(sums, size);
    let expected = parse_sums(&sums?, &asset.sums_name)
        .ok_or_else(|| format!("No checksum published for {}", asset.sums_name))?;
    Ok((expected, size))
}

async fn install_inner(r: &mut Reporter<'_>) -> Result<(PathBuf, Option<String>), String> {
    let (app, c) = (r.app, r.c);
    let dir = bin_dir(app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    let client = http_client()?;
    let list = assets(c)?;

    r.emit("connecting");
    let prepared: Vec<(String, Option<u64>)> =
        futures_util::future::join_all(list.iter().map(|a| prepare(&client, c, a)))
            .await
            .into_iter()
            .collect::<Result<_, _>>()?;
    r.total = prepared.iter().map(|(_, size)| *size).sum::<Option<u64>>();
    r.emit("downloading");

    for (asset, (expected, _)) in list.iter().zip(&prepared) {
        let tmp = dir.join(format!(".download-{}", uuid::Uuid::new_v4()));
        let actual = match download_to(r, &client, asset, &tmp).await {
            Ok(h) => h,
            Err(e) => {
                let _ = tokio::fs::remove_file(&tmp).await;
                return Err(e);
            }
        };
        if &actual != expected {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(format!("E:checksum_mismatch:{}", asset.sums_name));
        }
        r.emit("extracting");
        let (tmp2, dir2, asset2) = (tmp.clone(), dir.clone(), asset.clone());
        let res = tokio::task::spawn_blocking(move || extract(&tmp2, &asset2, &dir2))
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r);
        let _ = tokio::fs::remove_file(&tmp).await;
        res?;
    }

    // Run the new tool once: confirms it works on this machine and gets its
    // version. (The first run of a fresh download can take a few seconds while
    // the OS checks it.)
    r.emit("testing");
    let path = dir.join(exe(c.executables()[0]));
    let version = version_of(&path, c).await;
    if version.is_none() {
        return Err(format!("E:wont_run:{}", c.id()));
    }
    Ok((path, version))
}

/// Stream `asset.url` to `dest`, returning its SHA-256 (lowercase hex).
async fn download_to(
    r: &mut Reporter<'_>,
    client: &reqwest::Client,
    asset: &Asset,
    dest: &Path,
) -> Result<String, String> {
    let resp = client
        .get(&asset.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Couldn't download {}: {e}", asset.sums_name))?;
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("E:download_interrupted:{e}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        r.add_bytes(chunk.len() as u64);
    }
    file.flush().await.map_err(|e| e.to_string())?;
    r.emit("downloading");
    Ok(hex::encode(hasher.finalize()))
}

/// Move a finished file into place atomically and make it executable.
fn place(src: &Path, dir: &Path, name: &str) -> Result<(), String> {
    let target = dir.join(exe(name));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(src, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(src, &target)
        .map_err(|e| format!("Couldn't replace {} (is it in use?): {e}", target.display()))
}

fn extract(archive_path: &Path, asset: &Asset, dir: &Path) -> Result<(), String> {
    match asset.archive {
        Archive::Raw => {
            let staged = dir.join(format!("{}.new", exe(asset.members[0])));
            std::fs::copy(archive_path, &staged).map_err(|e| e.to_string())?;
            place(&staged, dir, asset.members[0])
        }
        Archive::Zip => {
            let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Bad archive: {e}"))?;
            let mut found = Vec::new();
            for i in 0..zip.len() {
                let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    continue;
                }
                let file_name = entry
                    .enclosed_name()
                    .as_deref()
                    .and_then(Path::file_name)
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if let Some(member) = asset.members.iter().find(|m| exe(m) == file_name) {
                    if found.contains(member) {
                        continue;
                    }
                    let staged = dir.join(format!("{file_name}.new"));
                    let mut out = std::fs::File::create(&staged).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
                    drop(out);
                    place(&staged, dir, member)?;
                    found.push(*member);
                }
            }
            check_found(asset, &found)
        }
        Archive::TarXz => {
            // Linux only: every mainstream distro ships tar with xz support.
            let staging = dir.join(format!(".extract-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
            let result = (|| {
                let status = std::process::Command::new("tar")
                    .arg("-xJf")
                    .arg(archive_path)
                    .arg("-C")
                    .arg(&staging)
                    .status()
                    .map_err(|e| format!("Couldn't run tar: {e}"))?;
                if !status.success() {
                    return Err("E:xz_failed".to_string());
                }
                let mut found = Vec::new();
                for member in &asset.members {
                    if let Some(p) = find_file(&staging, &exe(member)) {
                        let staged = dir.join(format!("{}.new", exe(member)));
                        std::fs::copy(&p, &staged).map_err(|e| e.to_string())?;
                        place(&staged, dir, member)?;
                        found.push(*member);
                    }
                }
                check_found(asset, &found)
            })();
            let _ = std::fs::remove_dir_all(&staging);
            result
        }
    }
}

fn check_found(asset: &Asset, found: &[&str]) -> Result<(), String> {
    let missing: Vec<_> = asset
        .members
        .iter()
        .filter(|m| !found.contains(m))
        .collect();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!("{} didn't contain {:?}", asset.sums_name, missing))
    }
}

fn find_file(root: &Path, name: &str) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).ok()?.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().is_some_and(|n| n == name) {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_checksum_lists() {
        let text = "f5389d36  yt-dlp.exe\n\
            0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa  yt-dlp_macos\n\
            767BA9DCE7052AA196F8B12652F433D76DE128BA168966FA84B6394D5E6C6795 *yt-dlp_linux\n";
        assert_eq!(
            parse_sums(text, "yt-dlp_macos").as_deref(),
            Some("0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa")
        );
        // binary-mode marker and uppercase are normalised
        assert_eq!(
            parse_sums(text, "yt-dlp_linux").as_deref(),
            Some("767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795")
        );
        // truncated hash is rejected, unknown name is None
        assert_eq!(parse_sums(text, "yt-dlp.exe"), None);
        assert_eq!(parse_sums(text, "yt-dlp_macos.zip"), None);
    }

    #[test]
    fn compares_versions() {
        assert!(version_newer("2026.10.26", "2026.9.30"));
        assert!(version_newer("2026.10.26.1", "2026.10.26"));
        assert!(!version_newer("2026.10.26", "2026.10.26"));
        assert!(!version_newer("2025.12.01", "2026.01.01"));
        assert!(version_newer("v2.9.8", "2.9.7"));
    }

    #[test]
    fn parses_tool_versions() {
        assert_eq!(
            parse_version(Component::YtDlp, "2026.10.26\n").as_deref(),
            Some("2026.10.26")
        );
        assert_eq!(
            parse_version(
                Component::Ffmpeg,
                "ffmpeg version 9.0.2 Copyright (c) 2000-2026\n"
            )
            .as_deref(),
            Some("9.0.2")
        );
        assert_eq!(
            parse_version(
                Component::Deno,
                "deno 2.9.8 (stable, release, aarch64-apple-darwin)\nv8 14\n"
            )
            .as_deref(),
            Some("2.9.8")
        );
    }

    #[test]
    fn has_assets_for_every_supported_platform() {
        for (os, arch) in [
            ("macos", "aarch64"),
            ("macos", "x86_64"),
            ("windows", "x86_64"),
            ("windows", "aarch64"),
            ("linux", "x86_64"),
            ("linux", "aarch64"),
        ] {
            for c in Component::ALL {
                let list = assets_for(c, os, arch).unwrap();
                let members: Vec<_> = list.iter().flat_map(|a| a.members.clone()).collect();
                assert_eq!(members, c.executables(), "{os}/{arch} {}", c.id());
            }
        }
        assert!(assets_for(Component::YtDlp, "freebsd", "x86_64").is_err());
        let mac = assets_for(Component::Ffmpeg, "macos", "aarch64").unwrap();
        assert!(mac[0].url.contains("/arm64/") && mac[0].url.ends_with("/ffmpeg.zip"));
    }
}
