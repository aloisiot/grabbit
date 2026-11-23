import { useEffect, useMemo, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useT } from "../i18n";
import { api, errorMessage } from "../lib/ipc";
import { fileName, formatBytes, formatDate } from "../lib/format";
import type { HistoryEntry } from "../lib/types";
import { useHistory } from "../stores/history";
import { optionsFromSettings, useSettings } from "../stores/settings";
import { Button, Card, ErrorNote, Icon, IconButton, Thumb, inputClass } from "./ui";

export function HistoryView({ onRedownload }: { onRedownload: () => void }) {
  const t = useT();
  const h = t.history;
  const { entries, refresh } = useHistory();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  async function redownload(e: HistoryEntry) {
    const base = optionsFromSettings(useSettings.getState().settings);
    await api.enqueue([
      { url: e.url, videoId: e.videoId, title: e.title, thumbnail: e.thumbnail, options: { ...base, mode: e.mode }, playlist: null },
    ]);
    onRedownload();
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (entries.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-12 text-center">
        <Icon name="clock" className="size-8 text-zinc-400" />
        <p className="font-medium text-zinc-700 dark:text-zinc-200">{h.emptyTitle}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{h.emptyBody}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1`}
          placeholder={h.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={h.search}
        />
        <Button
          variant="ghost"
          onClick={async () => {
            if (await ask(h.clearConfirm, { title: h.clear, kind: "warning", okLabel: h.clear, cancelLabel: t.common.cancel })) {
              await run(() => api.historyClear());
            }
          }}
        >
          {h.clear}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 dark:divide-zinc-800 dark:bg-zinc-900 dark:ring-zinc-800">
        {shown.map((e) => (
          <li key={e.id} className="flex items-center gap-3 p-3">
            <Thumb src={e.thumbnail} alt="" className="aspect-video w-20" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50" title={e.title}>
                {e.title}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={e.filepath ?? ""}>
                {formatDate(e.completedAt)} · {e.mode === "audio" ? t.common.audio : t.common.video}
                {e.sizeBytes ? ` · ${formatBytes(e.sizeBytes)}` : ""}
                {e.exists ? ` · ${fileName(e.filepath)}` : ` · ${h.fileGone}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {e.exists && e.filepath && (
                <>
                  <IconButton label={t.common.openFile} onClick={() => run(() => api.openFile(e.filepath!))}>
                    <Icon name="play" />
                  </IconButton>
                  <IconButton label={t.common.showInFolder} onClick={() => run(() => api.revealFile(e.filepath!))}>
                    <Icon name="folder" />
                  </IconButton>
                </>
              )}
              <IconButton label={h.downloadAgain} onClick={() => run(() => redownload(e))}>
                <Icon name="retry" />
              </IconButton>
              <IconButton label={h.remove} onClick={() => run(() => api.historyRemove(e.id))}>
                <Icon name="trash" />
              </IconButton>
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">{h.noMatch(query)}</li>}

      </ul>
    </div>
  );
}
