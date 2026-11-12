// Обробка медіа в браузері: фото → JPEG, відео → кадри + звук, запис → WAV.
// На сервер іде лише стиснений результат; саме відео нікуди не вивантажується.

function drawToJpeg(source: CanvasImageSource, width: number, height: number, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function imageToJpeg(file: Blob, maxSide = 1400, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return drawToJpeg(img, img.naturalWidth, img.naturalHeight, maxSide, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const once = (target: EventTarget, event: string, timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      { once: true },
    );
  });

/** Рівномірно бере до maxFrames кадрів (приблизно один на секунду). */
export async function videoToFrames(file: Blob, maxFrames = 10, maxSide = 1024, quality = 0.7): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    const ready = once(video, "loadeddata", 15_000);
    video.load();
    if (!(await ready) || !video.videoWidth) throw new Error("Браузер не зміг відкрити це відео");
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const count = Math.min(maxFrames, Math.max(1, Math.ceil(duration)));
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      const seeked = once(video, "seeked", 5_000);
      video.currentTime = Math.min(duration - 0.05, ((i + 0.5) * duration) / count);
      if (!(await seeked)) continue;
      frames.push(drawToJpeg(video, video.videoWidth, video.videoHeight, maxSide, quality));
    }
    if (frames.length === 0) throw new Error("Не вдалося взяти кадри з відео");
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export type WavAudio = { base64: string; seconds: number; hasSound: boolean };

/**
 * Декодує звук із запису або з відеофайлу, зводить у моно 16 кГц і пакує у WAV.
 * Повертає null, якщо звукової доріжки немає або браузер не може її прочитати.
 * hasSound = false означає тишу: такий запис не варто надсилати моделі.
 */
export async function toWav(blob: Blob, maxSeconds: number): Promise<WavAudio | null> {
  type Ctor = typeof AudioContext;
  const AudioCtx: Ctor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!AudioCtx) return null;

  let decoded: AudioBuffer;
  const ctx = new AudioCtx();
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  } finally {
    void ctx.close();
  }

  const rate = 16_000;
  const seconds = Math.min(decoded.duration, maxSeconds);
  if (!(seconds > 0.2)) return null;
  const offline = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);

  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  // поріг тиші підібрано з запасом: тихе мовлення має RMS від ~0,01
  return { base64: btoa(binary), seconds, hasSound: rms > 0.004 };
}
