import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../lib/ipc";
import { formatDuration, looksLikeUrl, pickHeight, STANDARD_HEIGHTS } from "../lib/format";
import type { DownloadOptions, PlaylistProbe, ProbeResult, VideoProbe } from "../lib/types";
import { useQueue } from "../stores/queue";
import { optionsFromSettings, useSettings } from "../stores/settings";
import { OptionsPanel } from "./OptionsPanel";
import { QueueList } from "./QueueList";
import { Button, Card, ErrorNote, Icon, Spinner, Thumb, inputClass } from "./ui";

export function DownloadView() {
  const settings = useSettings((s) => s.settings);
  const hasJobs = useQueue((s) => s.jobs.length > 0);
  const [url, setUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [options, setOptions] = useState<DownloadOptions>(() => optionsFromSettings(settings));
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const probeId = useRef(0);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function runProbe(target = url) {
    const link = target.trim();
    if (!link) return;
    if (!looksLikeUrl(link)) {
      setError("That doesn't look like a link. Paste a full URL starting with https://");
      return;
    }
    const id = ++probeId.current;
    setProbing(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.probe(link);
      if (id !== probeId.current) return; // a newer probe superseded this one
      const base = optionsFromSettings(useSettings.getState().settings);
      setOptions(r.kind === "video" ? { ...base, maxHeight: pickHeight(r.heights, base.maxHeight) } : base);
      setResult(r);
    } catch (e) {
      if (id === probeId.current) setError(errorMessage(e));
    } finally {
      if (id === probeId.current) setProbing(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        void runProbe(text);
      }
    } catch {
      inputRef.current?.focus();
      setError("Couldn't read the clipboard. Paste the link into the box with ⌘V / Ctrl+V.");
    }
  }

  function reset(message: string) {
    probeId.current++;
    setResult(null);
    setUrl("");
    setNotice(message);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runProbe();
        }}
      >
        <input
          ref={inputRef}
          className={`${inputClass} h-11 min-w-0 flex-1 text-base`}
          placeholder="Paste a video, playlist or channel link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text").trim();
            if (looksLikeUrl(text)) {
              e.preventDefault();
              setUrl(text);
              void runProbe(text);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Link to download"
        />
        <Button variant="secondary" className="h-11" onClick={pasteFromClipboard} title="Paste from clipboard">
          <Icon name="clipboard" /> Paste
        </Button>
        <Button type="submit" variant="primary" className="h-11 min-w-24" disabled={probing || !url.trim()}>
          {probing ? <Spinner /> : "Fetch"}
        </Button>
      </form>

      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Icon name="check" /> {notice}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {probing && (
        <Card className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Spinner /> Reading link… (playlists and channels can take a moment)
        </Card>
      )}

      {result?.kind === "video" && (
        <VideoCard
          video={result}
          options={options}
          onOptions={setOptions}
          onDownload={async () => {
            await api.enqueue([
              { url: result.url, videoId: result.id, title: result.title, thumbnail: result.thumbnail, options, playlist: null },
            ]);
            reset(`Added “${result.title}” to the queue`);
          }}
        />
      )}

      {result?.kind === "playlist" && (
        <PlaylistPicker
          playlist={result}
          options={options}
          onOptions={setOptions}
          onDownload={async (indices) => {
            const items = result.entries
              .filter((e) => indices.has(e.index))
              .map((e) => ({
                url: e.url,
                videoId: e.id,
                title: e.title,
                thumbnail: e.thumbnail,
                options,
                playlist: { title: result.title, index: e.index },
              }));
            await api.enqueue(items);
            reset(`Added ${items.length} item${items.length === 1 ? "" : "s"} from “${result.title}” to the queue`);
          }}
        />
      )}

      {!result && !probing && !error && !hasJobs && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-zinc-500 dark:text-zinc-400">
          <Icon name="download" className="size-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm">Paste a link from YouTube or another supported site to get started.</p>
          <p className="text-xs">Videos, playlists and channels all work.</p>
        </div>
      )}

      <QueueList />
    </div>
  );
}

function VideoCard({
  video,
  options,
  onOptions,
  onDownload,
}: {
  video: VideoProbe;
  options: DownloadOptions;
  onOptions: (o: DownloadOptions) => void;
  onDownload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex gap-4">
        <Thumb src={video.thumbnail} alt="" className="aspect-video w-44" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-semibold text-zinc-900 dark:text-zinc-50">{video.title}</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {[video.uploader, formatDuration(video.duration)].filter(Boolean).join(" · ")}
          </p>
          {video.heights.length > 0 && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Up to {video.heights[0]}p available</p>
          )}
        </div>
      </div>
      <OptionsPanel options={options} onChange={onOptions} heights={video.heights} subtitleLangs={video.subtitleLangs} />
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDownload();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" /> Download {options.mode === "audio" ? options.audioFormat.toUpperCase() : "video"}
        </Button>
      </div>
    </Card>
  );
}

function PlaylistPicker({
  playlist,
  options,
  onOptions,
  onDownload,
}: {
  playlist: PlaylistProbe;
  options: DownloadOptions;
  onOptions: (o: DownloadOptions) => void;
  onDownload: (indices: Set<number>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(playlist.entries.map((e) => e.index)));
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const visible = playlist.entries.filter((e) => e.title.toLowerCase().includes(filter.trim().toLowerCase()));

  const toggle = (index: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <Icon name="list" className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="line-clamp-2 font-semibold text-zinc-900 dark:text-zinc-50">{playlist.title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {[playlist.uploader, `${playlist.entries.length} videos`].filter(Boolean).join(" · ")} · saved into a folder named after the playlist
          </p>
        </div>
      </div>

      {playlist.entries.length === 0 ? (
        <ErrorNote>This playlist is empty or private.</ErrorNote>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setSelected(new Set(playlist.entries.map((e) => e.index)))}>
              Select all
            </Button>
            <Button size="sm" onClick={() => setSelected(new Set())}>
              Select none
            </Button>
            <input
              className={`${inputClass} h-7 min-w-0 flex-1 text-xs`}
              placeholder="Filter by title"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter playlist"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{selected.size} selected</span>
          </div>
          <ul className="max-h-72 overflow-y-auto rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-800">
            {visible.map((e) => (
              <li key={`${e.index}-${e.id}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <input type="checkbox" className="size-4 accent-indigo-600" checked={selected.has(e.index)} onChange={() => toggle(e.index)} />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-zinc-400">{e.index}</span>
                  <Thumb src={e.thumbnail} alt="" className="aspect-video w-16" />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">{e.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500">{formatDuration(e.duration)}</span>
                </label>
              </li>
            ))}
            {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-zinc-500">No titles match.</li>}
          </ul>
        </>
      )}

      <OptionsPanel options={options} onChange={onOptions} heights={STANDARD_HEIGHTS} />
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={busy || selected.size === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await onDownload(selected);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="download" /> Download {selected.size} {selected.size === 1 ? "item" : "items"}
        </Button>
      </div>
    </Card>
  );
}
