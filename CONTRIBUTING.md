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
- **No hard-coded UI text.** Add strings to `src/i18n/locales/en.ts` and use
  them through `useT()` (components) or `getT()` (plain helpers). The Rust side
  reports user-facing problems as codes (`E:code` or `E:code:detail`, translated
  under `errors` in the locale files) and job stages as codes (`starting`,
  `part:2`, `pp:Merger`), never English sentences.

## Translating

Grabbit ships in English, Portuguese (Brazil), Spanish, French and German.

- **App:** each language is a file in `src/i18n/locales/`, typed against
  `en.ts`, so `npm run typecheck` lists any missing or extra key. To add a
  language, copy `en.ts`, translate it, and register it in `LOCALES` in
  `src/i18n/index.ts`.
- **Website:** each language is a JSON file in `site/i18n/`. Keys ending in
  `_html` may contain markup. `npm run site:build` fails if a key is missing,
  and writes one page per language (English at the root, others in `pt-br/`,
  `es/`, `fr/`, `de/`). To add a language, add it to `LOCALES` in
  `scripts/site-i18n.mjs` along with a flag.
- Keep product names (Grabbit, yt-dlp, FFmpeg, Deno, MP4…) as they are, and
  use the labels the operating system itself shows (for example "Abrir Mesmo
  Assim" on macOS in Portuguese).
