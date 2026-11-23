import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ask } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/ipc";
import { heightLabel, STANDARD_HEIGHTS } from "../lib/format";
import type { AudioFormat, VideoContainer } from "../lib/types";
import { useSettings } from "../stores/settings";
import { ComponentsGroup } from "./Components";
import { FORMAT_HINT, pickFolder, shortPath } from "./OptionsPanel";
import { Button, FormRow, Group, Icon, PopUp, Segmented, Switch, inputClass } from "./ui";

/** Settings as inset grouped rows, like the Download page and macOS System Settings. */
export function SettingsView() {
  const { settings, update, reset } = useSettings();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  async function resetToDefaults() {
    const ok = await ask(
      "Restore every download default? Your downloads, history and installed components aren't affected.",
      { title: "Reset to Defaults", kind: "warning", okLabel: "Reset", cancelLabel: "Cancel" },
    );
    if (ok) await reset();
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <Group header="Downloads" footer="Defaults for new downloads. You can still change them for each download.">
        <FormRow label="Save to">
          <span className="min-w-0 truncate" title={settings.outputDir}>
            {shortPath(settings.outputDir)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => api.openFile(settings.outputDir)} title="Open the download folder">
            <Icon name="folder" className="size-3.5" /> Open
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              const dir = await pickFolder(settings.outputDir);
              if (dir) await update({ outputDir: dir });
            }}
          >
            Change…
          </Button>
        </FormRow>
        <FormRow label="Simultaneous downloads" detail="How many run at the same time">
          <PopUp
            label="Simultaneous downloads"
            value={String(settings.concurrency)}
            onChange={(v) => update({ concurrency: Number(v) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </PopUp>
        </FormRow>
      </Group>

      <Group header="Default format">
        <FormRow label="Download">
          <Segmented
            label="Default download type"
            value={settings.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: "video", label: <><Icon name="film" className="size-3.5" /> Video</> },
              { value: "audio", label: <><Icon name="music" className="size-3.5" /> Audio only</> },
            ]}
          />
        </FormRow>
        <FormRow label="Video quality">
          <PopUp
            label="Video quality"
            value={String(settings.maxHeight ?? "best")}
            onChange={(v) => update({ maxHeight: v === "best" ? null : Number(v) })}
          >
            <option value="best">Best available</option>
            {STANDARD_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                Up to {heightLabel(h)}
              </option>
            ))}
          </PopUp>
        </FormRow>
        <FormRow label="Video format" detail={FORMAT_HINT[settings.videoContainer]}>
          <PopUp
            label="Video format"
            value={settings.videoContainer}
            onChange={(v) => update({ videoContainer: v as VideoContainer })}
          >
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
          </PopUp>
        </FormRow>
        <FormRow label="Audio format" detail={FORMAT_HINT[settings.audioFormat]}>
          <PopUp label="Audio format" value={settings.audioFormat} onChange={(v) => update({ audioFormat: v as AudioFormat })}>
            <option value="mp3">MP3</option>
            <option value="m4a">M4A</option>
          </PopUp>
        </FormRow>
        <FormRow label="Embed title, thumbnail & chapters">
          <Switch
            label="Embed title, thumbnail and chapters"
            checked={settings.embedMetadata}
            onChange={(embedMetadata) => update({ embedMetadata })}
          />
        </FormRow>
      </Group>

      <Group header="Subtitles">
        <FormRow label="Download subtitles" detail="Embedded in video downloads">
          <Switch label="Download subtitles" checked={settings.subtitles} onChange={(subtitles) => update({ subtitles })} />
        </FormRow>
        {settings.subtitles && (
          <>
            <FormRow label="Languages" detail="Comma-separated codes; en.* matches every English variant">
              <input
                className={`${inputClass} h-6 w-32`}
                value={settings.subLangs}
                onChange={(e) => update({ subLangs: e.target.value })}
                placeholder="en.*,es"
                aria-label="Subtitle languages"
                spellCheck={false}
              />
            </FormRow>
            <FormRow label="Include auto-generated">
              <Switch
                label="Include auto-generated subtitles"
                checked={settings.autoSubtitles}
                onChange={(autoSubtitles) => update({ autoSubtitles })}
              />
            </FormRow>
          </>
        )}
      </Group>

      <ComponentsGroup />

      <Group
        header="About"
        footer={
          <>
            Grabbit runs on yt-dlp (Unlicense), FFmpeg (LGPL/GPL) and Deno (MIT), downloaded separately under their own
            licenses. Only download content you have the right to; you're responsible for following the terms of the sites
            you use and copyright law in your country.
          </>
        }
      >
        <FormRow label="Version">
          <span className="tabular-nums">{version ?? "—"}</span>
          <Button size="sm" variant="plain" onClick={() => api.openLink("releases")}>
            Release notes <Icon name="external" className="size-3" />
          </Button>
        </FormRow>
        <FormRow label="Source code">
          <Button size="sm" variant="plain" onClick={() => api.openLink("repository")}>
            GitHub <Icon name="external" className="size-3" />
          </Button>
        </FormRow>
        <FormRow label="Report a problem">
          <Button size="sm" variant="plain" onClick={() => api.openLink("issues")}>
            Open an Issue <Icon name="external" className="size-3" />
          </Button>
        </FormRow>
        <FormRow label="License">MIT</FormRow>
      </Group>

      <div className="flex justify-center pb-2">
        <Button variant="ghost" size="sm" onClick={resetToDefaults}>
          Reset to Defaults…
        </Button>
      </div>
    </div>
  );
}
