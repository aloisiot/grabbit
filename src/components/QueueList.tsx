import { useState } from "react";
import { api } from "../lib/ipc";
import { fileName, formatBytes, formatEta, formatSpeed } from "../lib/format";
import type { Job } from "../lib/types";
import { isActive, isFinished, useQueue } from "../stores/queue";
import { Button, IconButton, Icon, ProgressBar, Thumb } from "./ui";

export function QueueList() {
  const jobs = useQueue((s) => s.jobs);
  if (jobs.length === 0) return null;

  const active = jobs.filter(isActive).length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const finished = jobs.filter(isFinished).length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Queue{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            {[active && `${active} downloading`, queued && `${queued} waiting`].filter(Boolean).join(" · ")}
          </span>
        </h2>
        {finished > 0 && (
          <Button size="sm" variant="ghost" onClick={() => api.clearFinished()}>
            Clear finished
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {jobs.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
      </ul>
    </section>
  );
}

function JobRow({ job }: { job: Job }) {
  const [showLog, setShowLog] = useState(false);
  const active = isActive(job);

  let detail: string;
  switch (job.status) {
    case "queued":
      detail = "Waiting…";
      break;
    case "downloading":
      detail = [
        job.stage,
        job.totalBytes ? `${formatBytes(job.downloadedBytes)} of ${formatBytes(job.totalBytes)}` : null,
        formatSpeed(job.speed),
        formatEta(job.eta),
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    case "processing":
      detail = `${job.stage ?? "Processing"}…`;
      break;
    case "done":
      detail = fileName(job.filepath) || "Done";
      break;
    case "cancelled":
      detail = "Cancelled";
      break;
    case "error":
      detail = job.error ?? "Failed";
      break;
  }

  const kind = job.options.mode === "audio" ? job.options.audioFormat.toUpperCase() : job.options.videoContainer.toUpperCase();

  return (
    <li className="rounded-xl bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex items-center gap-3">
        <Thumb src={job.thumbnail} alt="" className="aspect-video w-20" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50" title={job.title}>
              {job.playlist && <span className="text-zinc-400">{job.playlist.index}. </span>}
              {job.title}
            </p>
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {kind}
            </span>
          </div>
          <p
            className={`mt-0.5 truncate text-xs ${
              job.status === "error"
                ? "text-accent-strong"
                : job.status === "done"
                  ? "text-accent"
                  : "text-zinc-500 dark:text-zinc-400"
            }`}
            title={detail}
          >
            {detail}
          </p>
          {active && (
            <div className="mt-2">
              <ProgressBar
                value={job.status === "downloading" ? job.percent : null}
                indeterminate={job.status !== "downloading" || job.percent == null}
                tone={job.status === "processing" ? "soft" : "accent"}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {job.status === "done" && job.filepath && (
            <>
              <IconButton label="Open file" onClick={() => api.openFile(job.filepath!)}>
                <Icon name="play" />
              </IconButton>
              <IconButton label="Show in folder" onClick={() => api.revealFile(job.filepath!)}>
                <Icon name="folder" />
              </IconButton>
            </>
          )}
          {(job.status === "error" || job.status === "cancelled") && (
            <IconButton label="Retry" onClick={() => api.retryJob(job.id)}>
              <Icon name="retry" />
            </IconButton>
          )}
          {job.status === "error" && job.log.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Hide details" : "Details"}
            </Button>
          )}
          {active || job.status === "queued" ? (
            <IconButton label="Cancel" variant="danger" onClick={() => api.cancelJob(job.id)}>
              <Icon name="x" />
            </IconButton>
          ) : (
            <IconButton label="Remove from list" onClick={() => api.removeJob(job.id)}>
              <Icon name="x" />
            </IconButton>
          )}
        </div>
      </div>
      {showLog && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300 select-text">
          {job.log.join("\n")}
        </pre>
      )}
    </li>
  );
}
