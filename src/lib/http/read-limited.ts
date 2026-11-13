/** Читає тіло відповіді з верхньою межею розміру (стрим або buffer). */
export async function readLimited(response: Response, max: number): Promise<Uint8Array | "too-large"> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max) return "too-large";
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > max ? "too-large" : bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > max) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
