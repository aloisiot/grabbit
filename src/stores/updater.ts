import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { errorMessage } from "../lib/ipc";

/**
 * App self-update (tauri-plugin-updater, manifest on GitHub releases).
 *
 * - `idle`: nothing to show (no update, check failed, or dismissed).
 * - `checking`: looking for an update.
 * - `available`: an update was found and waits for the user.
 * - `downloading` / `installing`: applying it; the app relaunches afterwards.
 * - `error`: the install failed; the user can continue with the current version.
 * - `upToDate`: a manual check (Settings) found nothing new.
 */
export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "installing" | "error" | "upToDate";

interface UpdaterState {
  phase: UpdatePhase;
  update: Update | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  /**
   * Look for an update. Network or config failures resolve to "no update" so
   * startup is never blocked; a manual check reports them instead.
   */
  check: (opts?: { manual?: boolean; autoInstall?: boolean }) => Promise<Update | null>;
  /** Download, install and relaunch. */
  install: () => Promise<void>;
  /** "Later" / "Continue": back to the app with the current version. */
  dismiss: () => void;
}

const CHECK_TIMEOUT_MS = 8000;

let inflight: Promise<Update | null> | null = null;

/** The update screen takes over the window (vs. inline status in Settings). */
export function updateScreenVisible(s: Pick<UpdaterState, "phase" | "update">): boolean {
  return (
    s.phase === "available" ||
    s.phase === "downloading" ||
    s.phase === "installing" ||
    (s.phase === "error" && s.update != null)
  );
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  update: null,
  downloaded: 0,
  total: null,
  error: null,

  check: ({ manual = false, autoInstall = false } = {}) => {
    // One check at a time; a second caller (e.g. React StrictMode) shares it.
    if (inflight) return inflight;
    const busy = get().phase;
    if (busy === "downloading" || busy === "installing") return Promise.resolve(get().update);
    set({ phase: "checking", error: null });
    inflight = (async () => {
      try {
        const update = await check({ timeout: CHECK_TIMEOUT_MS });
        set({ update, phase: update ? "available" : manual ? "upToDate" : "idle" });
        // Same tick as the set above, so the prompt never flashes on screen.
        if (update && autoInstall) void get().install();
        return update;
      } catch (e) {
        console.warn("Update check failed:", e);
        set({ update: null, phase: manual ? "error" : "idle", error: manual ? errorMessage(e) : null });
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  install: async () => {
    const { update, phase } = get();
    if (!update || phase === "downloading" || phase === "installing") return;
    set({ phase: "downloading", downloaded: 0, total: null, error: null });
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            set({ total: event.data.contentLength ?? null });
            break;
          case "Progress":
            set((s) => ({ downloaded: s.downloaded + event.data.chunkLength }));
            break;
          case "Finished":
            set({ phase: "installing" });
            break;
        }
      });
      // Windows exits inside downloadAndInstall (the installer relaunches the app).
      set({ phase: "installing" });
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: errorMessage(e) });
    }
  },

  dismiss: () => {
    const { phase } = get();
    if (phase === "downloading" || phase === "installing") return;
    set({ phase: "idle", error: null });
  },
}));
