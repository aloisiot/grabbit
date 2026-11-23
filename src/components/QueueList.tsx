import { useState } from "react";
import { describeError, stageLabel, useT } from "../i18n";
import { api } from "../lib/ipc";
import { fileName, formatBytes, formatEta, formatSpeed } from "../lib/format";
import type { Job } from "../lib/types";
import { isActive, isFinished, useQueue } from "../stores/queue";
import { Button, IconButton, Icon, ProgressBar, Thumb } from "./ui";

export function QueueList() {
  const t = useT();
  const jobs = useQueue((s) => s.jobs);
  if (jobs.length === 0) return null;

  const active = jobs.filter(isActive).length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const finished = jobs.filter(isFinished).length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          {t.queue.title}{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            {[active && t.queue.downloading(active), queued && t.queue.waiting(queued)].filter(Boolean).join(" · ")}
          </span>
        </h2>
        {finished > 0 && (
          <Button size="sm" variant="ghost" onClick={() => api.clearFinished()}>
            {t.queue.clearFinished}
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
  const t = useT();
  const q = t.queue;
  const stage = stageLabel(job.stage, t);
  const [showLog, setShowLog] = useState(false);
  const active = isActive(job);

  let detail: string;
  switch (job.status) {
    case "queued":
      detail = q.statusWaiting;
      break;
    case "downloading":
      detail = [
        stage,
        job.totalBytes ? t.common.of(formatBytes(job.downloadedBytes), formatBytes(job.totalBytes)) : null,
        formatSpeed(job.speed),
        formatEta(job.eta),
      ]
        .filter(Boolean)
        .join(" · ");
      break;
    case "processing":
      detail = `${stage ?? q.processing}…`;
      break;
    case "done":
      detail = fileName(job.filepath) || t.common.done;
      break;
    case "cancelled":
      detail = q.cancelled;
      break;
    case "error":
      detail = job.error ? describeError(job.error, t) : t.common.failed;
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
              <IconButton label={t.common.openFile} onClick={() => api.openFile(job.filepath!)}>
                <Icon name="play" />
              </IconButton>
              <IconButton label={t.common.showInFolder} onClick={() => api.revealFile(job.filepath!)}>
                <Icon name="folder" />
              </IconButton>
            </>
          )}
          {(job.status === "error" || job.status === "cancelled") && (
            <IconButton label={t.common.retry} onClick={() => api.retryJob(job.id)}>
              <Icon name="retry" />
            </IconButton>
          )}
          {job.status === "error" && job.log.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowLog((v) => !v)}>
              {showLog ? q.hideDetails : q.details}
            </Button>
          )}
          {active || job.status === "queued" ? (
            <IconButton label={t.common.cancel} variant="danger" onClick={() => api.cancelJob(job.id)}>
              <Icon name="x" />
            </IconButton>
          ) : (
            <IconButton label={q.removeFromList} onClick
={() => api.removeJob(job.id)}>
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
