import { create } from "zustand";
import { api, events } from "../lib/ipc";
import type { Job } from "../lib/types";

interface QueueState {
  jobs: Job[];
  init: () => Promise<void>;
}

export const useQueue = create<QueueState>((set) => ({
  jobs: [],
  init: async () => set({ jobs: await api.listJobs() }),
}));

void events.onJob((job) =>
  useQueue.setState((s) => {
    const i = s.jobs.findIndex((j) => j.id === job.id);
    if (i === -1) return { jobs: [...s.jobs, job] };
    const jobs = s.jobs.slice();
    jobs[i] = job;
    return { jobs };
  }),
);

void events.onJobRemoved((id) => useQueue.setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })));

export const isActive = (j: Job) => j.status === "downloading" || j.status === "processing";
export const isFinished = (j: Job) => j.status === "done" || j.status === "error" || j.status === "cancelled";
