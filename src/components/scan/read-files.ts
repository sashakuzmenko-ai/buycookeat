import { imageToJpeg, toWav, videoToFrames, type WavAudio } from "@/lib/media";
import type { MediaAllow } from "@/lib/scan/capture";
import { SCAN_LIMITS } from "@/lib/scan-types";

export type MediaState = {
  images: string[];
  audio: WavAudio | null;
  audioFrom: "mic" | "video" | null;
  fromVideo: boolean;
};

export function emptyMedia(): MediaState {
  return { images: [], audio: null, audioFrom: null, fromVideo: false };
}

export async function ingestFiles(
  files: readonly File[],
  initial: MediaState,
  allow: MediaAllow,
  onStatus: (message: string) => void,
): Promise<{ state: MediaState; error: string | null }> {
  const images = [...initial.images];
  let audio = initial.audio;
  let audioFrom = initial.audioFrom;
  let fromVideo = initial.fromVideo;
  let error: string | null = null;

  for (const file of files) {
    if (images.length >= SCAN_LIMITS.maxImages && !file.type.startsWith("audio/")) break;
    if (file.type.startsWith("video/")) {
      const video = await takeVideo(file, images, audio, allow, onStatus);
      images.push(...video.frames);
      if (video.audio) {
        audio = video.audio;
        audioFrom = "video";
      }
      if (video.frames.length > 0) fromVideo = true;
      error = video.error ?? error;
    } else if (file.type.startsWith("image/")) {
      const shot = await takeImage(file, images, allow, onStatus);
      if (shot.image) images.push(shot.image);
      error = shot.error ?? error;
    } else if (file.type.startsWith("audio/")) {
      const heard = await takeAudio(file, allow, onStatus);
      if (heard.audio) {
        audio = heard.audio;
        audioFrom = "mic";
      }
      error = heard.error ?? error;
    } else {
      error = "Цей тип файлу не підходить";
    }
  }

  return {
    state: { images: images.slice(0, SCAN_LIMITS.maxImages), audio, audioFrom, fromVideo },
    error,
  };
}

async function takeVideo(
  file: File,
  images: string[],
  audio: WavAudio | null,
  allow: MediaAllow,
  onStatus: (message: string) => void,
): Promise<{ frames: string[]; audio: WavAudio | null; error: string | null }> {
  if (!allow.video) return { frames: [], audio: null, error: "Тут приймаються лише фото" };
  if (images.length >= SCAN_LIMITS.maxImages) return { frames: [], audio: null, error: null };
  onStatus(`Беру кадри з відео «${file.name}»…`);
  const room = SCAN_LIMITS.maxImages - images.length;
  const frames = await videoToFrames(file, Math.min(10, room));
  if (audio) return { frames, audio: null, error: null };
  onStatus("Перевіряю звук у відео…");
  const wav = await toWav(file, SCAN_LIMITS.maxAudioSeconds);
  return { frames, audio: wav?.hasSound ? wav : null, error: null };
}

async function takeImage(
  file: File,
  images: string[],
  allow: MediaAllow,
  onStatus: (message: string) => void,
): Promise<{ image: string | null; error: string | null }> {
  if (!allow.image) return { image: null, error: "Тут приймається відео або голос" };
  if (images.length >= SCAN_LIMITS.maxImages) return { image: null, error: null };
  onStatus(`Готую фото «${file.name}»…`);
  return { image: await imageToJpeg(file), error: null };
}

async function takeAudio(
  file: File,
  allow: MediaAllow,
  onStatus: (message: string) => void,
): Promise<{ audio: WavAudio | null; error: string | null }> {
  if (!allow.audio) return { audio: null, error: "Аудіофайл додайте через «Голос»" };
  onStatus("Готую аудіо…");
  const wav = await toWav(file, SCAN_LIMITS.maxAudioSeconds);
  if (!wav?.hasSound) return { audio: null, error: "У цьому аудіофайлі не чути звуку" };
  return { audio: wav, error: null };
}
