// Typed wrappers around the Rust commands and events.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ComponentId,
  ComponentStatus,
  EnqueueItem,
  HistoryEntry,
  InstallProgress,
  Job,
  ProbeResult,
  UpdateInfo,
} from "./types";

export const api = {
  depsStatus: () => invoke<ComponentStatus[]>("deps_status"),
  depsInstall: (components?: ComponentId[]) => invoke<void>("deps_install", { components: components ?? null }),
  ytdlpCheckUpdate: () => invoke<UpdateInfo>("ytdlp_check_update"),

  probe: (url: string) => invoke<ProbeResult>("probe", { url }),

  enqueue: (items: EnqueueItem[]) => invoke<Job[]>("enqueue", { items }),
  listJobs: () => invoke<Job[]>("list_jobs"),
  cancelJob: (id: string) => invoke<void>("cancel_job", { id }),
  retryJob: (id: string) => invoke<void>("retry_job", { id }),
  removeJob: (id: string) => invoke<void>("remove_job", { id }),
  clearFinished: () => invoke<void>("clear_finished"),
  setConcurrency: (n: number) => invoke<void>("set_concurrency", { n }),

  historyList: () => invoke<HistoryEntry[]>("history_list"),
  historyRemove: (id: string) => invoke<void>("history_remove", { id }),
  historyClear: () => invoke<void>("history_clear"),

  defaultDownloadDir: () => invoke<string>("default_download_dir"),
  openFile: (path: string) => invoke<void>("open_file", { path }),
  revealFile: (path: string) => invoke<void>("reveal_file", { path }),
};

export const events = {
  onJob: (cb: (job: Job) => void): Promise<UnlistenFn> => listen<Job>("queue://job", (e) => cb(e.payload)),
  onJobRemoved: (cb: (id: string) => void): Promise<UnlistenFn> =>
    listen<string>("queue://removed", (e) => cb(e.payload)),
  onHistoryChanged: (cb: () => void): Promise<UnlistenFn> => listen("history://changed", () => cb()),
  onInstallProgress: (cb: (p: InstallProgress) => void): Promise<UnlistenFn> =>
    listen<InstallProgress>("deps://progress", (e) => cb(e.payload)),
};

/** Commands reject with a plain string; normalise anything else. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
