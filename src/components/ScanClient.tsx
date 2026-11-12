"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { applyScan } from "@/app/(app)/actions";
import { imageToJpeg, toWav, videoToFrames, type WavAudio } from "@/lib/media";
import { PRODUCT_CATEGORIES } from "@/lib/seed-data";
import { SCAN_LIMITS, type ScanMode, type ScanResult } from "@/lib/scan-types";

type Product = { id: string; name: string; unit: string };

type Row = {
  key: number;
  include: boolean;
  raw: string;
  productId: string; // "" = новий продукт
  name: string;
  category: string;
  unit: string;
  quantity: string;
  uncertain: boolean;
};

const SOURCE_LABEL: Record<ScanResult["source"], string> = {
  voice: "розпізнано з голосу",
  images: "розпізнано із зображень",
  both: "розпізнано з голосу та зображень",
  none: "нічого не розпізнано",
};

export function ScanClient({
  products,
  aiEnabled,
  initialMode = "add",
}: {
  products: Product[];
  aiEnabled: boolean;
  initialMode?: ScanMode;
}) {
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [images, setImages] = useState<string[]>([]);
  const [audio, setAudio] = useState<WavAudio | null>(null);
  const [audioFrom, setAudioFrom] = useState<"mic" | "video" | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, startSaving] = useTransition();

  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      const next = [...images];
      let nextAudio = audio;
      let nextFrom = audioFrom;
      for (const file of Array.from(files)) {
        if (next.length >= SCAN_LIMITS.maxImages) break;
        if (file.type.startsWith("video/")) {
          setStatus(`Беру кадри з відео «${file.name}»…`);
          const room = SCAN_LIMITS.maxImages - next.length;
          next.push(...(await videoToFrames(file, Math.min(10, room))));
          // голос із відео: спершу перевіряємо, чи там узагалі є звук
          if (!nextAudio) {
            setStatus("Перевіряю звук у відео…");
            const wav = await toWav(file, SCAN_LIMITS.maxAudioSeconds);
            if (wav?.hasSound) {
              nextAudio = wav;
              nextFrom = "video";
            }
          }
        } else if (file.type.startsWith("image/")) {
          setStatus(`Готую фото «${file.name}»…`);
          next.push(await imageToJpeg(file));
        } else if (file.type.startsWith("audio/")) {
          setStatus("Готую аудіо…");
          const wav = await toWav(file, SCAN_LIMITS.maxAudioSeconds);
          if (wav?.hasSound) {
            nextAudio = wav;
            nextFrom = "mic";
          } else setError("У цьому аудіофайлі не чути звуку");
        }
      }
      setImages(next.slice(0, SCAN_LIMITS.maxImages));
      setAudio(nextAudio);
      setAudioFrom(nextFrom);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося обробити файл");
    } finally {
      setStatus("");
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        setBusy(true);
        setStatus("Готую запис…");
        const wav = await toWav(new Blob(chunks, { type: rec.mimeType }), SCAN_LIMITS.maxAudioSeconds);
        if (!wav) setError("Не вдалося прочитати запис. Спробуйте ще раз.");
        else if (!wav.hasSound) setError("У записі тиша. Перевірте мікрофон і спробуйте ще раз.");
        else {
          setAudio(wav);
          setAudioFrom("mic");
        }
        setStatus("");
        setBusy(false);
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= SCAN_LIMITS.maxAudioSeconds && rec.state === "recording") rec.stop();
      }, 1000);
    } catch {
      setError("Немає доступу до мікрофона. Дозвольте його в налаштуваннях браузера.");
    }
  }

  async function recognize() {
    setError("");
    const body = JSON.stringify({ mode, images, audio: audio?.base64 ?? null, note });
    if (body.length > SCAN_LIMITS.maxBodyBytes) {
      setError("Забагато даних для одного запиту. Приберіть частину фото або зробіть коротший запис.");
      return;
    }
    setBusy(true);
    setStatus("Розпізнаю… це займає до пів хвилини");
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const data = (await response.json().catch(() => null)) as (ScanResult & { error?: string }) | null;
      if (!response.ok || !data || data.error) {
        setError(data?.error ?? `Помилка сервера (${response.status})`);
        return;
      }
      setResult(data);
      setRows(
        data.items.map((item, i) => ({
          key: i,
          include: true,
          raw: item.raw,
          productId: item.productId ?? "",
          name: item.name,
          category: item.category,
          unit: item.unit,
          quantity: String(item.quantity).replace(".", ","),
          uncertain: item.uncertain,
        })),
      );
    } catch {
      setError("Немає зв'язку із сервером. Перевірте інтернет і спробуйте ще раз.");
    } finally {
      setStatus("");
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setRows([]);
    setImages([]);
    setAudio(null);
    setAudioFrom(null);
    setNote("");
    setError("");
  }

  const patch = (key: number, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const selected = rows.filter((r) => r.include);

  function save() {
    setError("");
    const items = selected.map((r) => ({
      productId: r.productId || null,
      name: r.name,
      category: r.category,
      unit: r.productId ? (unitOf(r.productId) ?? r.unit) : r.unit,
      quantity: Number(r.quantity.replace(",", ".")),
    }));
    if (items.some((i) => !(i.quantity > 0))) {
      setError("Перевірте кількості: у кожної відміченої позиції має бути число більше нуля.");
      return;
    }
    startSaving(async () => {
      const response = await applyScan(mode, items);
      if (response?.error) setError(response.error);
    });
  }

  const modeSwitch = (
    <fieldset className="card mb-4">
      <legend className="sr-only">Що робимо з розпізнаним</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["add", "Купили", "додати до запасів"],
            ["set", "Інвентаризація", "стільки є зараз — замінити залишки"],
          ] as const
        ).map(([value, title, hint]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
              mode === value ? "border-brand-500 bg-brand-50" : "border-stone-200"
            }`}
          >
            <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 accent-brand-600" />
            <span>
              <span className="font-medium">{title}</span>
              <span className="block text-xs text-stone-500">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const errorBox = error && (
    <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {error}
    </div>
  );

  // ---------- Крок 2: перевірка ----------
  if (result) {
    return (
      <div>
        {modeSwitch}
        {errorBox}
        <div className="card mb-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="h2">Перевірте позиції</h2>
            <span className="text-xs text-stone-500">
              {SOURCE_LABEL[result.source]}
              {result.store ? ` · ${result.store}` : ""}
              {result.total ? ` · ${result.total.toLocaleString("uk-UA")} грн` : ""}
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-stone-600">
              Продуктів не знайдено. Спробуйте чіткіше фото, повільніше відео або надиктуйте продукти голосом.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map((row) => (
                <li key={row.key} className={`py-2.5 ${row.include ? "" : "opacity-50"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) => patch(row.key, { include: e.target.checked })}
                      aria-label={`Записати: ${row.name}`}
                      className="size-4 accent-brand-600"
                    />
                    <select
                      className="input min-w-0 flex-1 basis-40 py-1.5"
                      aria-label="Продукт"
                      value={row.productId}
                      onChange={(e) => patch(row.key, { productId: e.target.value })}
                    >
                      <option value="">➕ новий продукт</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      className="input w-24 py-1.5 text-right"
                      inputMode="decimal"
                      aria-label={`Кількість: ${row.name}`}
                      value={row.quantity}
                      onChange={(e) => patch(row.key, { quantity: e.target.value })}
                    />
                    <span className="w-6 text-xs text-stone-500">{row.productId ? unitOf(row.productId) : row.unit}</span>
                  </div>
                  {!row.productId && (
                    <div className="mt-2 ml-6 flex flex-wrap gap-2">
                      <input
                        className="input min-w-0 flex-1 basis-40 py-1.5"
                        aria-label="Назва нового продукту"
                        value={row.name}
                        onChange={(e) => patch(row.key, { name: e.target.value })}
                      />
                      <select className="input w-auto py-1.5" aria-label="Категорія" value={row.category} onChange={(e) => patch(row.key, { category: e.target.value })}>
                        {PRODUCT_CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <select className="input w-auto py-1.5" aria-label="Одиниця" value={row.unit} onChange={(e) => patch(row.key, { unit: e.target.value })}>
                        <option>г</option>
                        <option>мл</option>
                        <option>шт</option>
                      </select>
                    </div>
                  )}
                  <div className="mt-1 ml-6 text-xs text-stone-400">
                    {row.raw}
                    {row.uncertain && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">перевірте кількість</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={save} disabled={saving || selected.length === 0}>
            {saving ? "Записую…" : mode === "add" ? `Додати до запасів (${selected.length})` : `Оновити запаси (${selected.length})`}
          </button>
          <button className="btn-secondary" onClick={reset} disabled={saving}>Почати заново</button>
          {result.costUsd !== null && (
            <span className="ml-auto text-xs text-stone-400">вартість розпізнавання: ${result.costUsd.toFixed(4)}</span>
          )}
        </div>
      </div>
    );
  }

  // ---------- Крок 1: матеріали ----------
  const hasInput = images.length > 0 || audio !== null || note.trim() !== "";
  return (
    <div>
      {!aiEnabled && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Розпізнавання вимкнене: на сервері не задано ключ OpenRouter.
        </div>
      )}
      {modeSwitch}
      {errorBox}

      <div className="card mb-4 space-y-4">
        <div>
          <h2 className="h2 mb-1">Фото, скріншот або відео</h2>
          <p className="mb-2 text-xs text-stone-500">
            Чек, скріншот електронного чека, холодильник чи полиця. З відео беруться кадри й голос, якщо ви називаєте
            продукти; саме відео нікуди не надсилається. До {SCAN_LIMITS.maxImages} зображень за раз.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={busy || recording}
            onChange={(e) => addFiles(e.target.files)}
            aria-label="Обрати фото або відео"
            className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-600 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white"
          />
          {images.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <li key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- локальний data URL, оптимізація не потрібна */}
                  <img src={src} alt={`Зображення ${i + 1}`} className="size-16 rounded-lg border border-stone-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
                    aria-label={`Прибрати зображення ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-stone-700 text-xs text-white"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="h2 mb-1">Голос</h2>
          <p className="mb-2 text-xs text-stone-500">
            Назвіть продукти й кількості: «молоко два літри, десяток яєць, кілограм гречки». До{" "}
            {SCAN_LIMITS.maxAudioSeconds} секунд.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {recording ? (
              <button type="button" className="btn bg-red-600 hover:bg-red-700" onClick={() => recorder.current?.stop()}>
                ■ Зупинити ({seconds} с)
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={startRecording} disabled={busy}>
                ● {audio ? "Записати заново" : "Надиктувати"}
              </button>
            )}
            {audio && !recording && (
              <span className="chip">
                {audioFrom === "video" ? "голос із відео" : "запис"} · {Math.round(audio.seconds)} с
                <button type="button" onClick={() => { setAudio(null); setAudioFrom(null); }} aria-label="Прибрати запис" className="ml-1.5 cursor-pointer text-stone-400 hover:text-red-600">
                  ×
                </button>
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="note">Примітка (необов&apos;язково)</label>
          <input className="input" id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр.: це верхня полиця холодильника" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={recognize} disabled={!aiEnabled || busy || recording || !hasInput}>
          {busy ? "Зачекайте…" : "Розпізнати"}
        </button>
        {status && <span role="status" className="text-sm text-stone-600">{status}</span>}
      </div>
    </div>
  );
}
