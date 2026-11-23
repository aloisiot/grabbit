import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ask } from "@tauri-apps/plugin-dialog";
import { LOCALES, isLocale, useT } from "../i18n";
import { api } from "../lib/ipc";
import { heightLabel, STANDARD_HEIGHTS } from "../lib/format";
import type { AudioFormat, VideoContainer } from "../lib/types";
import { useSettings } from "../stores/settings";
import { ComponentsGroup } from "./Components";
import { pickFolder, shortPath } from "./OptionsPanel";
import { Button, FormRow, Group, Icon, PopUp, Segmented, Switch, inputClass } from "./ui";

/** Settings as inset grouped rows, like the Download page and macOS System Settings. */
export function SettingsView() {
  const t = useT();
  const s = t.settings;
  const o = t.options;
  const { settings, update, reset } = useSettings();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  async function resetToDefaults() {
    const ok = await ask(s.resetConfirm, { title: s.resetTitle, kind: "warning", okLabel: s.resetOk, cancelLabel: t.common.cancel });
    if (ok) await reset();
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <Group header={s.language}>
        <FormRow label={s.language}>
          <PopUp
            label={s.language}
            value={settings.language}
            onChange={(v) => update({ language: isLocale(v) ? v : "system" })}
          >
            <option value="system">🌐 {s.languageSystem}</option>
            {Object.entries(LOCALES).map(([code, l]) => (
              <option key={code} value={code} lang={code}>
                {l.flag} {l.name}
              </option>
            ))}

          </PopUp>
        </FormRow>
      </Group>

      <Group header={s.downloads} footer={s.downloadsFooter}>
        <FormRow label={o.saveTo}>
          <span className="min-w-0 truncate" title={settings.outputDir}>
            {shortPath(settings.outputDir)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => api.openFile(settings.outputDir)} title={s.openFolderTitle}>
            <Icon name="folder" className="size-3.5" /> {t.common.open}
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              const dir = await pickFolder(settings.outputDir);
              if (dir) await update({ outputDir: dir });
            }}
          >
            {t.common.change}
          </Button>
        </FormRow>
        <FormRow label={s.concurrency} detail={s.concurrencyHint}>
          <PopUp
            label={s.concurrency}
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

      <Group header={s.defaultFormat}>
        <FormRow label={o.download}>
          <Segmented
            label={s.defaultDownloadType}
            value={settings.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: "video", label: <><Icon name="film" className="size-3.5" /> {t.common.video}</> },
              { value: "audio", label: <><Icon name="music" className="size-3.5" /> {t.common.audioOnly}</> },
            ]}
          />
        </FormRow>
        <FormRow label={s.videoQuality}>
          <PopUp
            label={s.videoQuality}
            value={String(settings.maxHeight ?? "best")}
            onChange={(v) => update({ maxHeight: v === "best" ? null : Number(v) })}
          >
            <option value="best">{t.common.bestAvailable}</option>
            {STANDARD_HEIGHTS.map((h) => (
              <option key={h} value={h}>
                {s.upTo(heightLabel(h))}
              </option>
            ))}
          </PopUp>
        </FormRow>
        <FormRow label={s.videoFormat} detail={o.formatHint[settings.videoContainer]}>
          <PopUp
            label={s.videoFormat}
            value={settings.videoContainer}
            onChange={(v) => update({ videoContainer: v as VideoContainer })}
          >
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
          </PopUp>
        </FormRow>
        <FormRow label={s.audioFormat} detail={o.formatHint[settings.audioFormat]}>
          <PopUp label={s.audioFormat} value={settings.audioFormat} onChange={(v) => update({ audioFormat: v as AudioFormat })}>
            <option value="mp3">MP3</option>
            <option value="m4a">M4A</option>
          </PopUp>
        </FormRow>
        <FormRow label={o.embed}>
          <Switch
            label={o.embedLabel}
            checked={settings.embedMetadata}
            onChange={(embedMetadata) => update({ embedMetadata })}
          />
        </FormRow>
      </Group>

      <Group header={s.subtitles}>
        <FormRow label={s.downloadSubtitles} detail={s.downloadSubtitlesHint}>
          <Switch label={s.downloadSubtitles} checked={settings.subtitles} onChange={(subtitles) => update({ subtitles })} />
        </FormRow>
        {settings.subtitles && (
          <>
            <FormRow label={o.languages} detail={o.languagesHint}>
              <input
                className={`${inputClass} h-6 w-32`}
                value={settings.subLangs}
                onChange={(e) => update({ subLangs: e.target.value })}
                placeholder="en.*,es"
                aria-label={o.subtitleLangsLabel}
                spellCheck={false}
              />
            </FormRow>
            <FormRow label={o.autoGenerated}>
              <Switch
                label={o.autoGeneratedLabel}
                checked={settings.autoSubtitles}
                onChange={(autoSubtitles) => update({ autoSubtitles })}
              />
            </FormRow>
          </>
        )}
      </Group>

      <ComponentsGroup />

      <Group
        header={s.about}
        footer={s.aboutFooter}
      >
        <FormRow label={s.version}>
          <span className="tabular-nums">{version ?? "—"}</span>
          <Button size="sm" variant="plain" onClick={() => api.openLink("releases")}>
            {s.releaseNotes} <Icon name="external" className="size-3" />
          </Button>
        </FormRow>
        <FormRow label={s.sourceCode}>
          <Button size="sm" variant="plain" onClick={() => api.openLink("repository")}>
            GitHub <Icon name="external" className="size-3" />
          </Button>
        </FormRow>
        <FormRow label={s.reportProblem}>
          <Button size="sm" variant="plain" onClick={() => api.openLink("issues")}>
            {s.openIssue} <Icon name="external" className="size-3" />
          </Button>
        </FormRow>
        <FormRow label={s.license}>MIT</FormRow>
      </Group>

      <div className="flex justify-center pb-2">
        <Button variant="ghost" size="sm" onClick={resetToDefaults}>
          {s.reset}

        </Button>
      </div>
    </div>
  );
}
