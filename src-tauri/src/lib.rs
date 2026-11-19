mod binaries;
mod commands;
mod history;
mod process;
mod queue;
mod ytdlp;

use std::sync::Arc;

/// Set by build.rs from the icon files; reading it here ties recompilation
/// (and so the icons `generate_context!()` embeds) to icon changes.
const _ICONS_HASH: &str = env!("GRABBIT_ICONS_HASH");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage::<queue::QueueState>(Arc::new(queue::Queue::default()))
        .manage(history::HistoryLock::default())
        .invoke_handler(tauri::generate_handler![
            commands::deps_status,
            commands::deps_install,
            commands::ytdlp_check_update,
            commands::probe,
            commands::enqueue,
            commands::list_jobs,
            commands::cancel_job,
            commands::retry_job,
            commands::remove_job,
            commands::clear_finished,
            commands::set_concurrency,
            commands::history_list,
            commands::history_remove,
            commands::history_clear,
            commands::default_download_dir,
            commands::open_file,
            commands::reveal_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Grabbit")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                queue::kill_all(app);
            }
        });
}
