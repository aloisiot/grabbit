//! Persistent download history (`<app data>/history.json`).

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const MAX_ENTRIES: usize = 1000;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub video_id: Option<String>,
    pub title: String,
    pub thumbnail: Option<String>,
    pub filepath: Option<String>,
    /// "video" | "audio"
    pub mode: String,
    pub size_bytes: Option<u64>,
    /// Unix time in milliseconds.
    pub completed_at: u64,
    /// Filled in when listing; not persisted.
    #[serde(default, skip_deserializing)]
    pub exists: bool,
}

/// Serializes access to the history file.
#[derive(Default)]
pub struct HistoryLock(Mutex<()>);

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("history.json"))
        .map_err(|e| e.to_string())
}

fn load(app: &AppHandle) -> Vec<HistoryEntry> {
    file(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, entries: &[HistoryEntry]) -> Result<(), String> {
    let path = file(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn with_entries<T>(
    app: &AppHandle,
    f: impl FnOnce(&mut Vec<HistoryEntry>) -> T,
) -> Result<T, String> {
    let lock = app.state::<HistoryLock>();
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let mut entries = load(app);
    let out = f(&mut entries);
    save(app, &entries)?;
    let _ = app.emit("history://changed", ());
    Ok(out)
}

pub fn append(app: &AppHandle, entry: HistoryEntry) -> Result<(), String> {
    with_entries(app, |entries| {
        entries.insert(0, entry);
        entries.truncate(MAX_ENTRIES);
    })
}

pub fn list(app: &AppHandle) -> Vec<HistoryEntry> {
    let lock = app.state::<HistoryLock>();
    let _guard = lock.0.lock();
    let mut entries = load(app);
    for e in &mut entries {
        e.exists = e
            .filepath
            .as_ref()
            .is_some_and(|p| std::path::Path::new(p).exists());
    }
    entries
}

pub fn remove(app: &AppHandle, id: &str) -> Result<(), String> {
    with_entries(app, |entries| entries.retain(|e| e.id != id))
}

pub fn clear(app: &AppHandle) -> Result<(), String> {
    with_entries(app, |entries| entries.clear())
}
