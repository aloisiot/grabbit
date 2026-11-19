import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { api } from "../lib/ipc";
import type { AudioFormat, DownloadOptions, Mode, VideoContainer } from "../lib/types";

export interface Settings {
  outputDir: string;
  mode: Mode;
  /** Preferred max height; null = best available. */
  maxHeight: number | null;
  videoContainer: VideoContainer;
  audioFormat: AudioFormat;
  concurrency: number;
  subtitles: boolean;
  autoSubtitles: boolean;
  subLangs: string;
  embedMetadata: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  outputDir: "",
  mode: "video",
  maxHeight: 1080,
  videoContainer: "mp4",
  audioFormat: "mp3",
  concurrency: 2,
  subtitles: false,
  autoSubtitles: false,
  subLangs: "en.*",
  embedMetadata: true,
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

let store: Store | null = null;

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    store = await load("settings.json", { defaults: {}, autoSave: 200 });
    const saved = (await store.get<Partial<Settings>>("settings")) ?? {};
    const settings: Settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!settings.outputDir) settings.outputDir = await api.defaultDownloadDir();
    set({ settings, loaded: true });
    await api.setConcurrency(settings.concurrency);
  },

  update: async (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await store?.set("settings", settings);
    if (patch.concurrency !== undefined) await api.setConcurrency(settings.concurrency);
  },
}));

/** Per-download options derived from settings (the options panel edits a copy). */
export function optionsFromSettings(s: Settings): DownloadOptions {
  return {
    mode: s.mode,
    maxHeight: s.maxHeight,
    videoContainer: s.videoContainer,
    audioFormat: s.audioFormat,
    subtitles: s.subtitles,
    autoSubtitles: s.autoSubtitles,
    subLangs: s.subLangs,
    embedMetadata: s.embedMetadata,
    outputDir: s.outputDir,
  };
}
