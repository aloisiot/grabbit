import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorMessage } from "../lib/ipc";
import { formatBytes, formatEta, formatSpeed } from "../lib/format";
import { isInstalling, overallProgress, percentOf, stageText } from "../lib/install";
import type { ComponentId, ComponentStatus, InstallProgress, UpdateInfo } from "../lib/types";
import { useDeps } from "../stores/deps";
import { isActive, useQueue } from "../stores/queue";
import { Button, Icon, RingIcon, Spinner } from "./ui";

const INFO: Record<ComponentId, { name: string; about: string; icon: string }> = {
  "yt-dlp": { name: "yt-dlp", about: "download engine", icon: "download" },
  ffmpeg: { name: "ffmpeg", about: "video and audio processing", icon: "film" },
  deno: { name: "Deno", about: "JavaScript runtime for YouTube", icon: "gear" },
};

const NBSP = " ";

// ---------------------------------------------------------------------------
// One component row: fixed height; only the ring and the text change.
// ---------------------------------------------------------------------------

function rowState(c: ComponentStatus, p: InstallProgress | undefined) {
  const busy = isInstalling(p);
  const failed = p?.stage === "error";
  let status: string;
  if (p && (busy || failed || p.stage === "done")) status = stageText(p);
  else if (c.installed) status = `Ready${c.version ? ` · ${c.version}` : ""}${c.managed ? "" : " · system copy"}`;
  else status = c.required ? "Not installed" : "Not installed · optional";
  return { busy, failed, ready: !busy && !failed && c.installed, status, percent: percentOf(p) };
}

function ComponentRow({ c, onRetry }: { c: ComponentStatus; onRetry?: (id: ComponentId) => void }) {
  const progress = useDeps((s) => s.progress[c.id]);
  const { busy, failed, ready, status, percent } = rowState(c, progress);
  const info = INFO[c.id];

  return (
    <li className="flex h-14 items-center gap-3 px-4" aria-busy={busy}>
      <RingIcon
        icon={failed ? "alert" : ready ? "check" : info.icon}
        active={busy}
        value={progress?.stage === "downloading" ? percent : null}
        filled={ready}
        muted={!busy && !failed && !ready}
        label={`${info.name}: ${status}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5">
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{info.name}</span>
          <span className="text-zinc-400 dark:text-zinc-500"> · {info.about}</span>
        </p>
        <p
          className={`truncate text-xs leading-4 tabular-nums ${failed ? "text-accent-strong" : "text-zinc-500 dark:text-zinc-400"}`}
          title={failed ? (progress?.error ?? "") : (c.path ?? "")}
        >
          {status}
        </p>
      </div>
      {/* Fixed-width slot so the text column never resizes. */}
      <div className="flex w-14 shrink-0 justify-end">
        {busy && percent != null ? (
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{Math.floor(percent)}%</span>
        ) : failed && onRetry ? (
          <button
            type="button"
            onClick={() => onRetry(c.id)}
            className="text-xs font-medium text-accent hover:text-accent-strong hover:underline"
          >
            Retry
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function ComponentList({ onRetry }: { onRetry?: (id: ComponentId) => void }) {
  const status = useDeps((s) => s.status);
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {(status ?? []).map((c) => (
        <ComponentRow key={c.id} c={c} onRetry={onRetry} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// First-run setup screen
// ---------------------------------------------------------------------------

export function SetupScreen() {
  const { status, installing, install, finishSetup, progress } = useDeps();
  const o = overallProgress(progress);
  const missing = status?.filter((c) => !c.installed) ?? [];
  const missingRequired = missing.some((c) => c.required);
  const failedIds = Object.values(progress)
    .filter((p): p is InstallProgress => p?.stage === "error")
    .map((p) => p.component);
  const failed = !installing && failedIds.length > 0;
  const allSet = !installing && status != null && missing.length === 0;
  const canContinue = !installing && !missingRequired;
  const startButton = useRef<HTMLButtonElement>(null);

  // Short success moment, then into the app (or click to go now).
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!allSet) return;
    startButton.current?.focus();
    setCountdown(3);
    const tick = setInterval(() => setCountdown((n) => (n == null ? n : n - 1)), 1000);
    return () => clearInterval(tick);
  }, [allSet]);
  useEffect(() => {
    if (countdown === 0) finishSetup();
  }, [countdown, finishSetup]);

  // Summary: two fixed lines plus a percentage slot.
  let title: string;
  let detail: string;
  if (allSet) {
    title = "All set";
    detail = "Everything is installed and working.";
  } else if (installing) {
    title = `Installing · ${o.done} of ${o.count} ready`;
    detail =
      [
        o.total ? `${formatBytes(o.downloaded)} of ${formatBytes(o.total)}` : o.downloaded ? `${formatBytes(o.downloaded)}` : null,
        formatSpeed(o.speed),
        formatEta(o.eta),
      ]
        .filter(Boolean)
        .join(" · ") || "Connecting…";
  } else if (failed) {
    title = `${o.done} of ${o.count} ready`;
    detail = `${failedIds.map((id) => INFO[id].name).join(" and ")} couldn't be installed.`;
  } else {
    title = `${status?.length ?? 3} components`;
    detail = "About 140 MB, downloaded in parallel.";
  }
  let hint: ReactNode;
  if (allSet) hint = countdown != null && countdown > 0 ? `Opening Grabbit in ${countdown}…` : "Opening Grabbit…";
  else if (installing) hint = "Keep this window open.";
  else if (failed && canContinue)
    hint = (
      <button type="button" onClick={finishSetup} className="font-medium text-accent hover:text-accent-strong hover:underline">
        Continue without {missing.map((c) => INFO[c.id].name).join(", ")}
      </button>
    );
  else if (failed) hint = "Check your connection and retry.";
  else hint = "Takes about a minute.";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Set up Grabbit</h1>
      <p className="mt-1.5 h-10 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
        Grabbit uses three open-source tools, downloaded once from their official releases, verified, and kept in
        Grabbit's own folder.
      </p>

      <section className="mt-6 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800" aria-live="polite">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-50">{title}</p>
            <p className={`truncate text-xs leading-4 tabular-nums ${failed ? "text-accent-strong" : "text-zinc-500 dark:text-zinc-400"}`}>
              {detail || NBSP}
            </p>
          </div>
          <span className="w-12 shrink-0 text-right text-lg font-semibold tabular-nums text-accent">
            {installing && o.percent != null ? `${Math.floor(o.percent)}%` : allSet ? <Icon name="check" className="ml-auto size-5" /> : NBSP}
          </span>
        </div>
        <ComponentList onRetry={installing ? undefined : (id) => void install([id])} />
      </section>

      <div className="mt-4 flex h-9 items-center justify-between gap-3">
        <div className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
        {allSet ? (
          <Button ref={startButton} variant="primary" className="min-w-44" onClick={finishSetup}>
            Start using Grabbit
          </Button>
        ) : (
          <Button
            variant="primary"
            className="min-w-44 tabular-nums"
            disabled={installing || missing.length === 0}
            onClick={() => void install(failed ? failedIds : undefined)}
          >
            {installing
              ? `Installing${o.percent != null ? ` ${Math.floor(o.percent)}%` : "…"}`
              : failed
                ? `Retry ${failedIds.length === 1 ? INFO[failedIds[0]].name : "failed"}`
                : "Install"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings → Components
// ---------------------------------------------------------------------------

export function ComponentsPanel() {
  const { status, installing, install, error } = useDeps();
  const downloading = useQueue((s) => s.jobs.some(isActive));
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const missing = (status ?? []).filter((c) => !c.installed).map((c) => c.id);
  const ytdlp = status?.find((c) => c.id === "yt-dlp");
  const locked = installing || downloading;

  async function checkUpdate() {
    setChecking(true);
    setMessage(null);
    try {
      const u = await api.ytdlpCheckUpdate();
      setUpdate(u);
      setMessage(
        u.updateAvailable
          ? `yt-dlp ${u.latest} is available (you have ${u.current ?? "none"}).${u.managed ? "" : " Your copy is system-installed."}`
          : `yt-dlp is up to date (${u.latest}).`,
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  const note = (!installing && error) || message || (downloading ? "Components can be updated once downloads finish." : null);

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 border-y border-zinc-100 dark:border-zinc-800">
        <ComponentList onRetry={locked ? undefined : (id) => void install([id])} />
      </div>
      <p className="h-4 truncate text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite" title={note ?? ""}>
        {note ?? NBSP}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={checkUpdate} disabled={checking || installing} className="min-w-48">
          {checking ? <Spinner /> : <Icon name="retry" />} Check for yt-dlp update
        </Button>
        {update?.updateAvailable && (
          <Button
            variant="primary"
            disabled={locked}
            onClick={async () => {
              if (await install(["yt-dlp"])) {
                setUpdate(null);
                setMessage(null);
              }
            }}
          >
            {ytdlp?.managed ? "Update yt-dlp" : "Install managed yt-dlp"}
          </Button>
        )}
        {missing.length > 0 && (
          <Button variant="primary" disabled={locked} onClick={() => install(missing)}>
            Install missing
          </Button>
        )}
        <Button variant="ghost" disabled={locked} onClick={() => install(["yt-dlp", "ffmpeg", "deno"])}>
          Reinstall all
        </Button>
      </div>
    </div>
  );
}
