//! Helpers for spawning and stopping external tools (yt-dlp, ffmpeg, deno).

use std::ffi::OsStr;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A `tokio` command that never opens a console window on Windows and
/// doesn't inherit stdin.
pub fn command<S: AsRef<OsStr>>(program: S) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Configure `cmd` so the child (and anything it spawns, e.g. ffmpeg) can be
/// stopped together with [`kill_tree`].
pub fn isolate(cmd: &mut tokio::process::Command) {
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(not(unix))]
    let _ = cmd;
}

/// Stop a process and its children. On Unix the child was started as the
/// leader of its own process group (see [`isolate`]), so the whole group is
/// signalled: SIGTERM first, SIGKILL shortly after if anything survives.
pub fn kill_tree(pid: u32) {
    #[cfg(unix)]
    {
        let pgid = pid as libc::pid_t;
        // SAFETY: plain syscall; a stale pgid simply returns ESRCH.
        unsafe {
            libc::killpg(pgid, libc::SIGTERM);
        }
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            unsafe {
                libc::killpg(pgid, libc::SIGKILL);
            }
        });
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
}
