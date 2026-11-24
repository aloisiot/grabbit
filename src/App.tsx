import { useEffect, useState } from "react";
import { DownloadView } from "./components/DownloadView";
import { HistoryView } from "./components/HistoryView";
import { SettingsView } from "./components/SettingsView";
import { SetupScreen } from "./components/Components";
import { UpdateScreen } from "./components/UpdateScreen";
import { Button, ErrorNote, Icon, Logo } from "./components/ui";
import { useT } from "./i18n";
import { errorMessage } from "./lib/ipc";
import { useDeps } from "./stores/deps";
import { isActive, useQueue } from "./stores/queue";
import { useSettings } from "./stores/settings";
import { updateScreenVisible, useUpdater } from "./stores/updater";

type Tab = "download" | "history" | "settings";

const TABS: Tab[] = ["download", "history", "settings"];

export default function App() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("download");
  const [bootError, setBootError] = useState<string | null>(null);
  const settingsLoaded = useSettings((s) => s.loaded);
  const deps = useDeps((s) => s.status);
  const setupVisible = useDeps((s) => s.setupVisible);
  const active = useQueue((s) => s.jobs.filter((j) => isActive(j) || j.status === "queued").length);
  const [updateChecked, setUpdateChecked] = useState(false);
  const showUpdate = useUpdater(updateScreenVisible);

  useEffect(() => {
    // The update check runs before the app is shown (no download can be in
    // progress yet); it needs the settings for the auto-update choice.
    const settingsAndUpdate = useSettings
      .getState()
      .init()
      .then(() => useUpdater.getState().check({ autoInstall: useSettings.getState().settings.autoUpdate }))
      .finally(() => setUpdateChecked(true));
    Promise.all([settingsAndUpdate, useDeps.getState().init(), useQueue.getState().init()]).catch((e) =>
      setBootError(errorMessage(e)),
    );
  }, []);

  if (bootError) {
    return (
      <div className="p-6">
        <ErrorNote>{t.app.bootFailed(bootError)}</ErrorNote>
      </div>
    );
  }
  if (!settingsLoaded || !deps || !updateChecked) return <UpdateScreen booting />;
  if (showUpdate) return <UpdateScreen />;
  if (setupVisible) return <SetupScreen />;

  return (
    <div className="flex h-full flex-col">
      <header className="grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b-[0.5px] border-separator px-5 material-bar">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Logo className="size-[22px]" />
          Grabbit
        </div>
        <nav role="tablist" aria-label={t.app.sections} className="inline-flex gap-0.5 rounded-lg bg-fill p-0.5">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              onClick={() => setTab(id)}
              aria-selected={tab === id}
              className={`inline-flex h-6 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium transition-colors focus-visible:focus-ring ${
                tab === id ? "bg-surface text-label elev-control" : "text-label-secondary hover:text-label"
              }`}
            >
              {t.app.tabs[id]}
              {id === "download" && active > 0 && tab !== "download" && (
                <span className="min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-accent-on tabular-nums">{active}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex justify-end">
          {deps.some((c) => !c.installed) && (
            <Button size="sm" variant="plain" onClick={() => setTab("settings")}>
              <Icon name="alert" className="size-3.5" /> {t.app.denoMissing}

            </Button>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {/* Keep the download view mounted so a half-filled form survives tab switches. */}
        <div hidden={tab !== "download"} className="h-full">
          <DownloadView />
        </div>
        {tab !== "download" && (
          <div className="mx-auto max-w-3xl px-5 py-6">
            {tab === "history" && <HistoryView onRedownload={() => setTab("download")} />}
            {tab === "settings" && <SettingsView />}
          </div>
        )}
      </main>
    </div>
  );
}
