import { open } from "@tauri-apps/plugin-dialog";
import { heightLabel } from "../lib/format";
import type { DownloadOptions } from "../lib/types";
import { Button, FormRow, Group, Icon, PopUp, Segmented, Switch, inputClass } from "./ui";

export async function pickFolder(current: string): Promise<string | null> {
  const dir = await open({ directory: true, defaultPath: current || undefined, title: "Choose download folder" });
  return typeof dir === "string" ? dir : null;
}

export const FORMAT_HINT: Record<string, string> = {
  mp4: "Plays everywhere",
  mkv: "Keeps the best-quality codecs",
  mp3: "Most compatible",
  m4a: "AAC, no re-encoding",
};

/** Download options as an inset grouped form: label on the left, control on the right. */
export function OptionsPanel({
  options,
  onChange,
  heights,
  subtitleLangs,
}: {
  options: DownloadOptions;
  onChange: (o: DownloadOptions) => void;
  /** Heights to offer in the quality menu, highest first. */
  heights: number[];
  /** Languages with real subtitles, when known (single video). */
  subtitleLangs?: string[];
}) {
  const set = (patch: Partial<DownloadOptions>) => onChange({ ...options, ...patch });
  const video = options.mode === "video";

  // Make sure the current choice is always selectable.
  const offered = [...new Set([...heights, ...(options.maxHeight ? [options.maxHeight] : [])])].sort((a, b) => b - a);

  const subtitleNote =
    video && options.subtitles && subtitleLangs
      ? subtitleLangs.length > 0
        ? `Subtitles available: ${subtitleLangs.slice(0, 12).join(", ")}${subtitleLangs.length > 12 ? "…" : ""}`
        : "This video has no uploaded subtitles. Turn on auto-generated to get YouTube's automatic captions."
      : undefined;

  return (
    <Group header="Options" footer={subtitleNote}>
      <FormRow label="Download">
        <Segmented
          label="Download type"
          value={options.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: "video", label: <><Icon name="film" className="size-3.5" /> Video</> },
            { value: "audio", label: <><Icon name="music" className="size-3.5" /> Audio only</> },
          ]}
        />
      </FormRow>

      {video && (
        <FormRow label="Quality">
          <PopUp
            label="Quality"
            value={String(options.maxHeight ?? "best")}
            onChange={(v) => set({ maxHeight: v === "best" ? null : Number(v) })}
          >
            <option value="best">Best available</option>
            {offered.map((h) => (
              <option key={h} value={h}>
                {heightLabel(h)}
              </option>
            ))}
          </PopUp>
        </FormRow>
      )}

      {video ? (
        <FormRow label="Format" detail={FORMAT_HINT[options.videoContainer]}>
          <PopUp
            label="Format"
            value={options.videoContainer}
            onChange={(v) => set({ videoContainer: v as DownloadOptions["videoContainer"] })}
          >
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
          </PopUp>
        </FormRow>
      ) : (
        <FormRow label="Format" detail={FORMAT_HINT[options.audioFormat]}>
          <PopUp
            label="Format"
            value={options.audioFormat}
            onChange={(v) => set({ audioFormat: v as DownloadOptions["audioFormat"] })}
          >
            <option value="mp3">MP3</option>
            <option value="m4a">M4A</option>
          </PopUp>
        </FormRow>
      )}

      <FormRow label="Embed title, thumbnail & chapters">
        <Switch
          label="Embed title, thumbnail and chapters"
          checked={options.embedMetadata}
          onChange={(embedMetadata) => set({ embedMetadata })}
        />
      </FormRow>

      {video && (
        <FormRow label="Subtitles">
          <Switch label="Subtitles" checked={options.subtitles} onChange={(subtitles) => set({ subtitles })} />
        </FormRow>
      )}
      {video && options.subtitles && (
        <>
          <FormRow label="Languages" detail="Comma-separated codes; en.* matches every English variant">
            <input
              className={`${inputClass} h-6 w-32`}
              value={options.subLangs}
              onChange={(e) => set({ subLangs: e.target.value })}
              placeholder="en.*,es"
              aria-label="Subtitle languages"
              spellCheck={false}
            />
          </FormRow>
          <FormRow label="Include auto-generated">
            <Switch
              label="Include auto-generated subtitles"
              checked={options.autoSubtitles}
              onChange={(autoSubtitles) => set({ autoSubtitles })}
            />
          </FormRow>
        </>
      )}

      <FormRow label="Save to">
        <span className="min-w-0 truncate" title={options.outputDir}>
          {shortPath(options.outputDir)}
        </span>
        <Button
          size="sm"
          onClick={async () => {
            const dir = await pickFolder(options.outputDir);
            if (dir) set({ outputDir: dir });
          }}
        >
          Change…
        </Button>
      </FormRow>
    </Group>
  );
}

/** "/Users/ana/Downloads" → "~/Downloads" for display; the full path stays in the tooltip. */
export function shortPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}
