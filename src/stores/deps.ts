import { create } from "zustand";
import { api, errorMessage, events } from "../lib/ipc";
import type { ComponentId, ComponentStatus, InstallProgress } from "../lib/types";

interface DepsState {
  status: ComponentStatus[] | null;
  progress: Partial<Record<ComponentId, InstallProgress>>;
  installing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  install: (ids?: ComponentId[]) => Promise<boolean>;
}

export const useDeps = create<DepsState>((set, get) => ({
  status: null,
  progress: {},
  installing: false,
  error: null,

  refresh: async () => {
    set({ status: await api.depsStatus() });
  },

  install: async (ids) => {
    if (get().installing) return false;
    set({ installing: true, error: null, progress: {} });
    try {
      await api.depsInstall(ids);
      return true;
    } catch (e) {
      set({ error: errorMessage(e) });
      return false;
    } finally {
      set({ installing: false });
      await get().refresh();
    }
  },
}));

void events.onInstallProgress((p) =>
  useDeps.setState((s) => ({ progress: { ...s.progress, [p.component]: p } })),
);

export function missingRequired(status: ComponentStatus[] | null): boolean {
  return !!status?.some((c) => c.required && !c.installed);
}
