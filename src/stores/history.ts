import { create } from "zustand";
import { api, events } from "../lib/ipc";
import type { HistoryEntry } from "../lib/types";

interface HistoryState {
  entries: HistoryEntry[];
  refresh: () => Promise<void>;
}

export const useHistory = create<HistoryState>((set) => ({
  entries: [],
  refresh: async () => set({ entries: await api.historyList() }),
}));

void events.onHistoryChanged(() => void useHistory.getState().refresh());
