import { create } from "zustand";
import { api, errorMessage, events } from "../lib/ipc";
import type { ComponentId, ComponentStatus, InstallProgress } from "../lib/types";

export { isInstalling, overallProgress } from "../lib/install";

interface DepsState {
  status: ComponentStatus[] | null;
  progress: Partial<Record<ComponentId, InstallProgress>>;
  installing: boolean;
  error: string | null;
  /** Show the first-run screen. Decided once at startup; cleared by `finishSetup`. */
  setupVisible: boolean;
  /** Fast check (file presence), then versions in the background. */
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  install: (ids?: ComponentId[]) => Promise<boolean>;
  finishSetup: () => void;
}

export const useDeps = create<DepsState>((set, get) => ({
  status: null,
  progress: {},
  installing: false,
  error: null,
  setupVisible: false,

  init: async () => {
    const status = await api.depsStatus(false);
    set({ status, setupVisible: missingRequired(status) });
    void get().refresh();
  },

  refresh: async () => {
    const status = await api.depsStatus(true);
    // Don't let a slow refresh overwrite rows that an install just updated.
    if (!get().installing) set({ status });
  },

  install: async (ids) => {
    if (get().installing) return false;
    const targets = ids ?? get().status?.filter((c) => !c.installed).map((c) => c.id) ?? [];
    set((s) => {
      const progress = { ...s.progress };
      for (const id of targets) delete progress[id];
      return { installing: true, error: null, progress };
    });
    try {
      await api.depsInstall(ids);
      return true;
    } catch (e) {
      set({ error: errorMessage(e) });
      return false;
    } finally {
      set({ installing: false });
      void get().refresh();
    }
  },

  finishSetup: () => set({ setupVisible: false }),
}));

void events.onInstallProgress((p) =>
  useDeps.setState((s) => {
    const progress = { ...s.progress, [p.component]: p };
    // Mark the row installed the moment its component is ready.
    const status =
      p.stage === "done" && s.status
        ? s.status.map((c) =>
            c.id === p.component ? { ...c, installed: true, managed: true, version: p.version, path: p.path } : c,
          )
        : s.status;
    return { progress, status };
  }),
);

export function missingRequired(status: ComponentStatus[] | null): boolean {
  return !!status?.some((c) => c.required && !c.installed);
}
