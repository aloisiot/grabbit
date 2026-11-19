# Contributing to Grabbit

Thanks for helping out!

## Getting started

1. Install Node.js 20+, Rust (via [rustup](https://rustup.rs)) and the
   [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
2. `npm install`, then `npm run tauri dev`.

## Before opening a pull request

```bash
npm run typecheck && npm test
cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
```

CI runs the same checks on macOS, Windows and Linux.

## Guidelines

- **Keep yt-dlp logic in `src-tauri/src/ytdlp.rs`** and cover argument and parsing
  changes with unit tests. These are the parts most likely to need changes
  when yt-dlp or YouTube change.
- **Run processes from Rust only.** The webview has no shell or filesystem
  permissions on purpose (see `src-tauri/capabilities/default.json`).
- **Always pass URLs to yt-dlp after `--`**, so a link can never be read as an option.
- **Pinned download sources** (for example the macOS ffmpeg build) live at the
  top of `binaries.rs`. When you bump one, check its checksum file still exists.
- **UI**: React + Tailwind. Support light and dark mode, and keep it usable
  at the minimum window size (720×560).
