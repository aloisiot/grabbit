# Grabbit

A free, open-source desktop app for downloading video and audio, built on
[yt-dlp](https://github.com/yt-dlp/yt-dlp). Paste a link, choose video or
audio-only and a quality, and download. Runs on macOS, Windows and Linux.

- **Video or audio**: MP4 (plays everywhere) or MKV (best codecs); MP3 or M4A audio
- **Quality picker**: shows the resolutions actually available for each video
- **Download queue**: several downloads at once, with live progress, cancel and retry
- **Playlists and channels**: list the entries, pick which ones to download; each playlist gets its own folder
- **Subtitles and metadata**: embed subtitles (uploaded or auto-generated), title, thumbnail and chapters
- **History**: open, show in folder, or download again
- **Self-updating engine**: update yt-dlp from inside the app when YouTube changes break it, with no app update needed

## How it works

Grabbit is a front-end. The actual work is done by three open-source tools,
which Grabbit downloads on first run from their official release pages
(SHA-256 checksums verified) into its own data folder:

| Tool | Used for | Source |
|---|---|---|
| yt-dlp | Downloading | [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) |
| ffmpeg + ffprobe | Merging video and audio, MP3 conversion, embedding metadata | Windows/Linux: [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds); macOS: [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de) |
| Deno | JavaScript runtime that yt-dlp needs for full YouTube support | [Deno releases](https://github.com/denoland/deno/releases) |

If you already have these installed (Homebrew, winget, apt…), Grabbit uses
them as a fallback.

The app is built with [Tauri 2](https://tauri.app). It has a Rust core that runs and
monitors yt-dlp, and a React + TypeScript interface.

```
src/                 React UI (components, Zustand stores, typed IPC in lib/ipc.ts)
src-tauri/src/
  binaries.rs        find / download / verify / update yt-dlp, ffmpeg, deno
  ytdlp.rs           options → yt-dlp arguments, probing, progress parsing, error messages
  queue.rs           download queue: concurrency, progress events, cancel, retry
  history.rs         download history (history.json in the app data folder)
  commands.rs        commands exposed to the UI
```

## Install

Download the installer for your system from the
[Releases](../../releases) page.

The builds aren't code-signed yet, so your OS will warn the first time:

- **macOS**: right-click the app → **Open** → **Open**. Or run
  `xattr -dr com.apple.quarantine /Applications/Grabbit.app`.
- **Windows**: on the SmartScreen prompt, click **More info** → **Run anyway**.
- **Linux**: use the `.deb`, or `chmod +x` the `.AppImage` and run it.

## Development

Prerequisites: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs),
and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)
for your OS.

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm run dev            # UI only, in a browser, with a mocked backend (src/dev/mock.ts)
npm test               # frontend unit tests (Vitest)
npm run typecheck
cd src-tauri && cargo test && cargo clippy --all-targets
npm run tauri build    # build an installer for your platform
```

Releases: push a tag like `v0.1.0` and GitHub Actions builds installers for
macOS (Apple Silicon and Intel), Windows and Linux into a draft release.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

Grabbit is a tool. Only download content you have the right to download. You
are responsible for complying with the terms of service of the sites you use
and with the copyright laws of your country. Grabbit is not affiliated with
YouTube, Google, or the yt-dlp project.

## License

[MIT](LICENSE). The tools Grabbit downloads at runtime have their own
licenses: yt-dlp (Unlicense), FFmpeg (LGPL/GPL, depending on the build), and Deno (MIT).
