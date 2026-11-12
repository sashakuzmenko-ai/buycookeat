"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { captureBlockReason, mediaAllow, resolveCaptureType, type CaptureKind, type CaptureMedia } from "@/lib/scan/capture";
import { inputTypeLabel } from "@/lib/scan/present";
import { SCAN_LIMITS, type ScanMode } from "@/lib/scan-types";
import { MediaPreview } from "./MediaPreview";
import { ModeSwitch } from "./ModeSwitch";
import { emptyMedia, ingestFiles, type MediaState } from "./read-files";
import { useAudioRecorder } from "./use-audio-recorder";

export type CaptureHandle = {
  begin: (kind: CaptureKind) => void;
  addFiles: (files: FileList | null) => void;
};

const ACCEPT: readonly (readonly [CaptureKind, string | null, boolean])[] = [
  ["receipt", "image/*", true],
  ["screenshot", "image/*", true],
  ["video", "video/*", false],
  ["file", "image/*,video/*,audio/*", true],
  ["voice", null, false],
  ["text", null, false],
];

function acceptFor(kind: CaptureKind): readonly [string, boolean] | null {
  const row = ACCEPT.find(([id]) => id === kind);
  if (!row || !row[1]) return null;
  return [row[1], row[2]];
}

function panelTitle(kind: CaptureKind): string {
  if (kind === "file") return "Файл або голос";
  return inputTypeLabel(kind);
}

function browseLabel(kind: CaptureKind): string {
  if (kind === "video") return "Обрати відео";
  if (kind === "file") return "Обрати файл";
  return "Обрати фото";
}

export const CapturePanel = forwardRef<
  CaptureHandle,
  {
    aiEnabled: boolean;
    initialMode: ScanMode;
    autoKind: CaptureKind | null;
    fileRef: RefObject<HTMLInputElement | null>;
    onOpenChange: (open: boolean) => void;
  }
>(function CapturePanel({ aiEnabled, initialMode, autoKind, fileRef, onOpenChange }, ref) {
  const router = useRouter();
  const mediaRef = useRef<MediaState>(emptyMedia());
  const kindRef = useRef<CaptureKind>(autoKind ?? "file");
  const [kind, setKind] = useState<CaptureKind | null>(autoKind);
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [media, setMedia] = useState<MediaState>(emptyMedia());
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function remember(next: MediaState) {
    mediaRef.current = next;
    setMedia(next);
  }

  function browse(accept: string, multiple: boolean) {
    const input = fileRef.current;
    if (!input) return;
    input.accept = accept;
    input.multiple = multiple;
    input.click();
  }

  function begin(next: CaptureKind) {
    const cleared = emptyMedia();
    kindRef.current = next;
    remember(cleared);
    setKind(next);
    onOpenChange(true);
    setText("");
    setNote("");
    setError("");
    setStatus("");
    const accept = acceptFor(next);
    if (accept) browse(accept[0], accept[1]);
  }

  useImperativeHandle(ref, () => ({
    begin,
    addFiles: (files) => {
      void onFiles(files);
    },
  }));

  const recorder = useAudioRecorder(
    (wav) => {
      remember({ ...mediaRef.current, audio: wav, audioFrom: "mic" });
      setError("");
    },
    (message) => setError(message),
  );

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await ingestFiles(Array.from(list), mediaRef.current, mediaAllow(kindRef.current), setStatus);
      remember(result.state);
      if (result.error) setError(result.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося обробити файл");
    } finally {
      setStatus("");
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function recognize() {
    if (!kind) return;
    const snapshot: CaptureMedia = {
      images: media.images.length,
      audio: Boolean(media.audio),
      fromVideo: media.fromVideo,
      text,
      note,
    };
    const reason = captureBlockReason(kind, snapshot);
    if (reason) {
      setError(reason);
      return;
    }
    const payload = JSON.stringify({
      mode,
      inputType: resolveCaptureType(kind, snapshot),
      images: media.images,
      audio: media.audio?.base64 ?? null,
      text: text.trim(),
      note: note.trim(),
    });
    if (payload.length > SCAN_LIMITS.maxBodyBytes) {
      setError("Забагато даних для одного запиту. Приберіть частину фото або зробіть коротший запис.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Розпізнаю… це займає до пів хвилини");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !data?.id) {
        setError(data?.error ?? `Помилка сервера (${response.status})`);
        return;
      }
      setKind(null);
      onOpenChange(false);
      remember(emptyMedia());
      setText("");
      setNote("");
      router.push(`/scan?id=${data.id}`);
      router.refresh();
    } catch {
      setError("Немає зв'язку із сервером. Перевірте інтернет і спробуйте ще раз.");
    } finally {
      setStatus("");
      setBusy(false);
    }
  }

  const locked = busy || recorder.recording || recorder.preparing;
  const showMic = kind === "voice" || kind === "file";
  const showFiles = kind === "receipt" || kind === "screenshot" || kind === "video" || kind === "file";
  const fileAccept = kind ? acceptFor(kind) : null;

  return (
    <div>
      {kind && (
        <section className="flex flex-col gap-4 rounded-18 bg-ink-raised p-4 text-white" aria-label={panelTitle(kind)}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">{panelTitle(kind)}</h2>
            <button
              type="button"
              onClick={() => {
                setKind(null);
                onOpenChange(false);
              }}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-xl text-ink-muted-on-dark"
              aria-label="Закрити"
            >
              ×
            </button>
          </div>
          <ModeSwitch value={mode} onChange={setMode} tone="dark" disabled={locked} className="w-full lg:w-auto" />
          {kind === "text" && (
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-muted-on-dark">
              Текст
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={2000}
                placeholder="Купив сир і сметану"
                className="input min-h-24 py-2"
              />
            </label>
          )}
          {showFiles && fileAccept && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => browse(fileAccept[0], fileAccept[1])}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-12 bg-surface px-4 text-[15px] font-semibold text-ink disabled:opacity-50"
              >
                {browseLabel(kind)}
              </button>
            </div>
          )}
          {showMic && (
            <div className="flex flex-wrap items-center gap-2">
              {recorder.recording ? (
                <button type="button" onClick={recorder.stop} className="inline-flex min-h-11 cursor-pointer items-center rounded-12 bg-recipes px-4 font-semibold text-white">
                  Зупинити ({recorder.seconds} с)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void recorder.start()}
                  disabled={locked}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-12 border border-line-strong bg-surface px-4 font-semibold text-ink disabled:opacity-50"
                >
                  {media.audio ? "Записати заново" : "Надиктувати"}
                </button>
              )}
              {kind === "voice" && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => browse("audio/*", false)}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-12 border border-line-strong bg-surface px-4 font-semibold text-ink disabled:opacity-50"
                >
                  Аудіофайл
                </button>
              )}
            </div>
          )}
          <MediaPreview
            images={media.images}
            audio={media.audio}
            audioFrom={media.audioFrom}
            onRemoveImage={(index) => remember({ ...media, images: media.images.filter((_, item) => item !== index) })}
            onRemoveAudio={() => remember({ ...media, audio: null, audioFrom: null })}
          />
          {kind !== "text" && (
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-muted-on-dark" htmlFor="scan-note">
              Примітка (необов&apos;язково)
              <input id="scan-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className="input" placeholder="напр.: це верхня полиця холодильника" />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-12 bg-recipes-tint px-3 py-2 text-sm text-recipes-ink">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void recognize()}
              disabled={!aiEnabled || locked}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-12 bg-lime px-4 font-semibold text-ink disabled:opacity-50"
            >
              {locked ? "Зачекайте…" : "Розпізнати"}
            </button>
            {status && (
              <span role="status" className="text-sm text-ink-muted-on-dark">
                {status}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
});
