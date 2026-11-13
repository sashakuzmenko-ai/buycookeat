"use client";

import type { WavAudio } from "@/lib/media";

export function MediaPreview({
  images,
  audio,
  audioFrom,
  onRemoveImage,
  onRemoveAudio,
}: {
  images: readonly string[];
  audio: WavAudio | null;
  audioFrom: "mic" | "video" | null;
  onRemoveImage: (index: number) => void;
  onRemoveAudio: () => void;
}) {
  if (images.length === 0 && !audio) return null;
  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((src, index) => (
            <li key={`${index}-${src.length}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- локальний data URL */}
              <img src={src} alt={`Зображення ${index + 1}`} className="size-16 rounded-12 border border-line object-cover" />
              <button
                type="button"
                onClick={() => onRemoveImage(index)}
                aria-label={`Прибрати зображення ${index + 1}`}
                className="absolute -top-3 -right-3 flex size-11 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center"
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-ink text-xs text-white">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {audio && (
        <span className="inline-flex w-fit items-center rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-ink-2">
          {audioFrom === "video" ? "голос із відео" : "запис"} · {Math.round(audio.seconds)} с
          <button type="button" onClick={onRemoveAudio} aria-label="Прибрати запис" className="ml-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer text-ink-2">
            ×
          </button>
        </span>
      )}
    </div>
  );
}
