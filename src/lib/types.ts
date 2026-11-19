// Mirrors the serde types in src-tauri (camelCase).

export type Mode = "video" | "audio";
export type VideoContainer = "mp4" | "mkv";
export type AudioFormat = "mp3" | "m4a";

export interface DownloadOptions {
  mode: Mode;
  maxHeight: number | null;
  videoContainer: VideoContainer;
  audioFormat: AudioFormat;
  subtitles: boolean;
  autoSubtitles: boolean;
  subLangs: string;
  embedMetadata: boolean;
  outputDir: string;
}

export interface PlaylistContext {
  title: string;
  index: number;
}

export interface VideoProbe {
  kind: "video";
  id: string;
  url: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  duration: number | null;
  heights: number[];
  subtitleLangs: string[];
}

export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  index: number;
}

export interface PlaylistProbe {
  kind: "playlist";
  id: string;
  url: string;
  title: string;
  uploader: string | null;
  entries: PlaylistEntry[];
}

export type ProbeResult = VideoProbe | PlaylistProbe;

export type JobStatus = "queued" | "downloading" | "processing" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  url: string;
  videoId: string | null;
  title: string;
  thumbnail: string | null;
  options: DownloadOptions;
  playlist: PlaylistContext | null;
  status: JobStatus;
  stage: string | null;
  percent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speed: number | null;
  eta: number | null;
  filepath: string | null;
  error: string | null;
  log: string[];
}

export interface EnqueueItem {
  url: string;
  videoId: string | null;
  title: string;
  thumbnail: string | null;
  options: DownloadOptions;
  playlist: PlaylistContext | null;
}

export interface HistoryEntry {
  id: string;
  url: string;
  videoId: string | null;
  title: string;
  thumbnail: string | null;
  filepath: string | null;
  mode: Mode;
  sizeBytes: number | null;
  completedAt: number;
  exists: boolean;
}

export type ComponentId = "yt-dlp" | "ffmpeg" | "deno";

export interface ComponentStatus {
  id: ComponentId;
  installed: boolean;
  managed: boolean;
  path: string | null;
  version: string | null;
  required: boolean;
}

export type InstallStage = "queued" | "connecting" | "downloading" | "extracting" | "testing" | "done" | "error";

export interface InstallProgress {
  component: ComponentId;
  stage: InstallStage;
  /** Bytes downloaded so far across all files of the component. */
  downloaded: number;
  total: number | null;
  /** Smoothed bytes per second while downloading. */
  speed: number | null;
  version: string | null;
  path: string | null;
  error: string | null;
}

export interface UpdateInfo {
  current: string | null;
  latest: string;
  updateAvailable: boolean;
  managed: boolean;
}
