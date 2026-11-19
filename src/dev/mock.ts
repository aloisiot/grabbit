// Browser-only preview: fakes the Rust backend so the UI can be developed and
// reviewed with `npm run dev` in a regular browser. Never included in the app
// build (main.tsx only imports it when there's no Tauri runtime in dev mode).
//
// Add `?setup` to the URL to start on the first-run screen.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import type { ComponentStatus, EnqueueItem, HistoryEntry, Job, ProbeResult } from "../lib/types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function installMocks() {
  mockWindows("main");

  let installed = !new URLSearchParams(location.search).has("setup");
  let concurrency = 2;
  const jobs: Job[] = [];
  let history: HistoryEntry[] = [
    {
      id: "h1",
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      videoId: "aqz-KE-bpKQ",
      title: "Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film",
      thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
      filepath: "/Users/me/Downloads/Big Buck Bunny [aqz-KE-bpKQ].mp4",
      mode: "video",
      sizeBytes: 734_003_200,
      completedAt: Date.now() - 86_400_000,
      exists: true,
    },
  ];

  const status = (): ComponentStatus[] =>
    (["yt-dlp", "ffmpeg", "deno"] as const).map((id) => ({
      id,
      installed,
      managed: installed,
      path: installed ? `/Users/me/Library/Application Support/app.grabbit.desktop/bin/${id}` : null,
      version: installed ? { "yt-dlp": "2026.10.26", ffmpeg: "9.0.2", deno: "2.9.8" }[id] : null,
      required: id !== "deno",
    }));

  const update = (job: Job) => void emit("queue://job", { ...job });

  async function run(job: Job) {
    const total = 48_000_000 + Math.random() * 90_000_000;
    job.status = "downloading";
    for (let p = 0; p <= 100; p += 4) {
      if ((job.status as Job["status"]) === "cancelled") return update(job); // set by cancel_job meanwhile
      Object.assign(job, {
        stage: "Downloading",
        percent: p,
        downloadedBytes: (total * p) / 100,
        totalBytes: total,
        speed: 6_500_000,
        eta: Math.round(((100 - p) / 4) * 0.25),
      });
      update(job);
      await wait(250);
    }
    for (const stage of ["Merging video and audio", "Embedding thumbnail"]) {
      Object.assign(job, { status: "processing", stage, speed: null, eta: null });
      update(job);
      await wait(800);
    }
    const ext = job.options.mode === "audio" ? job.options.audioFormat : job.options.videoContainer;
    const filepath = `${job.options.outputDir}/${job.title} [${job.videoId}].${ext}`;
    if (job.title.toLowerCase().includes("private")) {
      Object.assign(job, { status: "error", stage: null, error: "This video is private.", log: ["ERROR: [youtube] x: Private video"] });
    } else {
      Object.assign(job, { status: "done", stage: null, filepath });
      history = [{ id: job.id, url: job.url, videoId: job.videoId, title: job.title, thumbnail: job.thumbnail, filepath, mode: job.options.mode, sizeBytes: total, completedAt: Date.now(), exists: true }, ...history];
      void emit("history://changed", null);
    }
    update(job);
  }

  function schedule() {
    const running = jobs.filter((j) => j.status === "downloading" || j.status === "processing").length;
    jobs
      .filter((j) => j.status === "queued")
      .slice(0, Math.max(0, concurrency - running))
      .forEach((j) => {
        j.status = "downloading";
        void run(j).then(schedule);
      });
  }

  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      switch (cmd) {
        case "deps_status":
          return status();
        case "deps_install":
          for (const component of ["yt-dlp", "ffmpeg", "deno"] as const) {
            for (let d = 0; d <= 40_000_000; d += 4_000_000) {
              void emit("deps://progress", { component, stage: "downloading", downloaded: d, total: 40_000_000, part: 1, parts: 1, error: null });
              await wait(60);
            }
            void emit("deps://progress", { component, stage: "done", downloaded: 0, total: null, part: 0, parts: 0, error: null });
          }
          installed = true;
          return null;
        case "ytdlp_check_update":
          return { current: "2026.10.26", latest: "2026.11.12", updateAvailable: true, managed: true };
        case "probe": {
          await wait(700);
          const url = String(a.url);
          if (url.includes("list=") && !url.includes("v=")) {
            return {
              kind: "playlist",
              id: "PLdemo",
              url,
              title: "Blender Open Movies",
              uploader: "Blender",
              entries: ["Big Buck Bunny", "Sintel", "Tears of Steel", "Cosmos Laundromat", "Spring", "Agent 327", "Private test video"].map((title, i) => ({
                id: `vid${i}`,
                url: `https://www.youtube.com/watch?v=vid${i}`,
                title,
                duration: 300 + i * 97,
                thumbnail: null,
                index: i + 1,
              })),
            } satisfies ProbeResult;
          }
          if (url.includes("fail")) throw "This video is unavailable (removed, private, or blocked in your region).";
          return {
            kind: "video",
            id: "aqz-KE-bpKQ",
            url,
            title: "Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film",
            uploader: "Blender",
            thumbnail: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
            duration: 635,
            heights: [2160, 1440, 1080, 720, 480, 360, 240, 144],
            subtitleLangs: ["en", "es", "pt"],
          } satisfies ProbeResult;
        }
        case "enqueue": {
          const added = (a.items as EnqueueItem[]).map<Job>((i) => ({
            ...i,
            id: crypto.randomUUID(),
            status: "queued",
            stage: null,
            percent: null,
            downloadedBytes: null,
            totalBytes: null,
            speed: null,
            eta: null,
            filepath: null,
            error: null,
            log: [],
          }));
          jobs.push(...added);
          added.forEach(update);
          schedule();
          return added;
        }
        case "list_jobs":
          return jobs;
        case "cancel_job": {
          const j = jobs.find((j) => j.id === a.id);
          if (j) {
            j.status = "cancelled";
            j.stage = null;
            update(j);
          }
          return null;
        }
        case "retry_job": {
          const j = jobs.find((j) => j.id === a.id);
          if (j) Object.assign(j, { status: "queued", error: null, percent: null, log: [] });
          if (j) update(j);
          schedule();
          return null;
        }
        case "remove_job":
        case "clear_finished": {
          for (let i = jobs.length - 1; i >= 0; i--) {
            const j = jobs[i];
            const finished = ["done", "error", "cancelled"].includes(j.status);
            if (finished && (cmd === "clear_finished" || j.id === a.id)) {
              jobs.splice(i, 1);
              void emit("queue://removed", j.id);
            }
          }
          return null;
        }
        case "set_concurrency":
          concurrency = Number(a.n);
          schedule();
          return null;
        case "history_list":
          return history;
        case "history_remove":
          history = history.filter((h) => h.id !== a.id);
          void emit("history://changed", null);
          return null;
        case "history_clear":
          history = [];
          void emit("history://changed", null);
          return null;
        case "default_download_dir":
          return "/Users/me/Downloads";
        case "open_file":
        case "reveal_file":
          console.info(`[mock] ${cmd}`, a.path);
          return null;
        // plugins
        case "plugin:store|load":
          return 1;
        case "plugin:store|get":
          return [null, false];
        case "plugin:store|set":
        case "plugin:store|save":
          return null;
        case "plugin:dialog|open":
          return "/Users/me/Movies";
        case "plugin:dialog|ask":
        case "plugin:dialog|message":
          return true;
        default:
          console.warn("[mock] unhandled command", cmd, args);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
