import { useT } from "../i18n";
import { formatBytes } from "../lib/format";
import { api } from "../lib/ipc";
import { isActive, useQueue } from "../stores/queue";
import { useUpdater } from "../stores/updater";
import { Button, ErrorNote, Icon, Logo, ProgressBar, Spinner } from "./ui";

/**
 * Full-window launch screen: shown while Grabbit starts and checks for an
 * update, and while an update is offered or being installed.
 * `booting` forces the "checking" look before the update check has begun.
 */
export function UpdateScreen({ booting = false }: { booting?: boolean }) {
  const t = useT();
  const u = t.updater;
  const { phase, update, downloaded, total, error, install, dismiss } = useUpdater();
  // Only possible after a manual check from Settings; relaunching stops them.
  const downloadsRunning = useQueue((s) => s.jobs.some(isActive));
  const applying = phase === "downloading" || phase === "installing";
  const percent = total ? (downloaded / total) * 100 : null;

  let body;
  if (phase === "error" && update) {
    body = (
      <>
        <p className="text-sm font-medium text-label">{u.failed}</p>
        {error && (
          <div className="w-full text-left">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={dismiss}>{u.continue}</Button>
          <Button variant="primary" onClick={() => void install()}>
            {t.common.retry}
          </Button>
        </div>
      </>
    );
  } else if (applying && update) {
    body = (
      <>
        <p className="text-sm font-medium text-label">
          {phase === "installing" ? u.installing(update.version) : u.downloading(update.version)}
        </p>
        <div className="w-64">
          <ProgressBar value={phase === "installing" ? 100 : percent} indeterminate={phase !== "installing" && percent == null} />
        </div>
        <p className="h-4 text-xs text-label-secondary tabular-nums">
          {phase === "downloading" && downloaded > 0
            ? total
              ? t.common.of(formatBytes(downloaded), formatBytes(total))
              : formatBytes(downloaded)
            : u.restartHint}
        </p>
      </>
    );
  } else if (phase === "available" && update) {
    body = (
      <>
        <div className="flex flex-col items-center gap-1">
          <p className="text-base font-semibold text-label">{u.available(update.version)}</p>
          <p className="text-sm text-label-secondary">{u.availableDetail(update.currentVersion)}</p>
          <Button size="sm" variant="plain" onClick={() => void api.openLink("releases")}>
            {u.whatsNew} <Icon name="external" className="size-3" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={dismiss}>{u.later}</Button>
          <Button variant="primary" autoFocus onClick={() => void install()}>
            {u.install}
          </Button>
        </div>
        <p className="text-xs text-label-tertiary">{downloadsRunning ? u.downloadsWillStop : u.autoUpdateTip}</p>
      </>
    );
  } else {
    body = (
      <p className="flex items-center gap-2 text-sm text-label-secondary">
        <Spinner className="size-4" />
        {booting || phase === "checking" ? u.checking : u.starting}
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center" aria-live="polite" aria-busy={phase !== "available"}>
      <div className="flex flex-col items-center gap-3">
        <Logo className={`size-20 ${phase === "checking" || booting ? "animate-pulse" : ""}`} />
        <h1 className="text-xl font-semibold text-label">Grabbit</h1>
      </div>
      <div className="flex max-w-md flex-col items-center gap-4">{body}</div>
    </div>
  );
}
