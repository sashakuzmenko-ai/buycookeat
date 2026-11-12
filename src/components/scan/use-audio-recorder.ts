"use client";

import { useEffect, useRef, useState } from "react";
import { toWav, type WavAudio } from "@/lib/media";
import { SCAN_LIMITS } from "@/lib/scan-types";

type Handlers = {
  onWav: (wav: WavAudio) => void;
  onError: (message: string) => void;
};

export function useAudioRecorder(onWav: (wav: WavAudio) => void, onError: (message: string) => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const handlers = useRef<Handlers | null>(null);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    handlers.current = { onWav, onError };
  }, [onWav, onError]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function start() {
    const bag = handlers.current;
    if (!bag) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      rec.onstop = () => {
        setPreparing(true);
        void finishRecording(stream, chunks, rec.mimeType, bag, timer, setRecording).finally(() => setPreparing(false));
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
      armTimer(rec, timer, setSeconds);
    } catch {
      bag.onError("Немає доступу до мікрофона. Дозвольте його в налаштуваннях браузера.");
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return { recording, preparing, seconds, start, stop };
}

function armTimer(
  rec: MediaRecorder,
  timer: { current: ReturnType<typeof setInterval> | null },
  setSeconds: (value: number) => void,
) {
  const startedAt = Date.now();
  timer.current = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    setSeconds(elapsed);
    if (elapsed >= SCAN_LIMITS.maxAudioSeconds && rec.state === "recording") rec.stop();
  }, 1000);
}

async function finishRecording(
  stream: MediaStream,
  chunks: Blob[],
  mime: string,
  bag: Handlers,
  timer: { current: ReturnType<typeof setInterval> | null },
  setRecording: (value: boolean) => void,
) {
  stream.getTracks().forEach((track) => track.stop());
  if (timer.current) clearInterval(timer.current);
  setRecording(false);
  const wav = await toWav(new Blob(chunks, { type: mime }), SCAN_LIMITS.maxAudioSeconds);
  if (!wav) bag.onError("Не вдалося прочитати запис. Спробуйте ще раз.");
  else if (!wav.hasSound) bag.onError("У записі тиша. Перевірте мікрофон і спробуйте ще раз.");
  else bag.onWav(wav);
}
