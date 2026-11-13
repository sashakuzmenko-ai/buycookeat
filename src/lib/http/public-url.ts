import { lookup } from "node:dns/promises";
import https from "node:https";

function ipv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function ipv6Private(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("fe80:")) return true;
  const first = lower.split(":")[0] ?? "";
  if (first.length === 2 && first >= "fc" && first <= "fd") return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(lower);
  if (mapped) return ipv4Private(mapped[1]);
  return false;
}

function ipAddressBlocked(address: string): boolean {
  return address.includes(":") ? ipv6Private(address) : ipv4Private(address);
}

const LITERAL_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export class PublicFetchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicFetchError";
    this.status = status;
  }
}

function hostBlocked(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  const bare = lower.replace(/^\[|\]$/g, "");
  if (bare === "localhost" || bare === "::1" || bare.endsWith(".localhost") || bare.endsWith(".local")) return true;
  if (lower === "[::1]") return true;
  if (LITERAL_IPV4.test(bare)) return ipv4Private(bare);
  if (bare.includes(":")) return ipv6Private(bare);
  return false;
}

async function assertPublicResolvableHost(hostname: string): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (hostBlocked(hostname)) throw new PublicFetchError(400, "Локальні й приватні адреси заборонені");
  if (LITERAL_IPV4.test(bare) || bare.includes(":")) return;
  let records: { address: string }[];
  try {
    records = await lookup(bare, { all: true, verbatim: true });
  } catch {
    throw new PublicFetchError(502, "Не вдалося визначити адресу сервера");
  }
  if (!records.length) throw new PublicFetchError(502, "Не вдалося визначити адресу сервера");
  for (const { address } of records) {
    if (ipAddressBlocked(address)) throw new PublicFetchError(400, "Локальні й приватні адреси заборонені");
  }
}

function portAllowed(url: URL): boolean {
  if (!url.port) return true;
  return url.protocol === "https:" && url.port === "443";
}

/** Дозволені лише публічні https URL без нестандартних портів. */
export function checkPublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Вкажіть адресу сторінки з рецептом" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Некоректна адреса" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Підтримуються лише захищені https-адреси" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Адреса з логіном і паролем не підтримується" };
  }
  if (hostBlocked(url.hostname)) {
    return { ok: false, error: "Локальні й приватні адреси заборонені" };
  }
  if (!portAllowed(url)) {
    return { ok: false, error: "Дозволені лише стандартні порти (443)" };
  }
  return { ok: true, url };
}

const MAX_REDIRECTS = 5;

function initHeaders(init: Omit<RequestInit, "redirect">): Record<string, string> {
  const raw = init.headers;
  if (!raw) return {};
  if (raw instanceof Headers) {
    return Object.fromEntries(raw.entries());
  }
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map(([k, v]) => [k, String(v)]));
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
}

function nodeHttpsRequest(url: URL, headers: Record<string, string>, signal?: AbortSignal | null): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
      },
      (res) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
            res.on("end", () => controller.close());
            res.on("error", (err) => controller.error(err));
          },
        });
        resolve(new Response(body, { status: res.statusCode ?? 502, headers: responseHeaders }));
      },
    );
    const onAbort = () => {
      req.destroy();
      reject(new DOMException("The operation was aborted", "TimeoutError"));
    };
    req.on("error", reject);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    req.end();
  });
}

/** Завантажує публічну сторінку без автоматичного follow — кожне перенаправлення перевіряється. */
export async function fetchPublicHttpResponse(
  url: URL,
  fetchImpl: typeof fetch | undefined,
  init: Omit<RequestInit, "redirect">,
): Promise<Response> {
  const headers = initHeaders(init);
  const signal = init.signal ?? undefined;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicResolvableHost(current.hostname);
    if (current.protocol !== "https:") {
      throw new PublicFetchError(400, "Підтримуються лише захищені https-адреси");
    }

    const response = fetchImpl
      ? await fetchImpl(current.toString(), { ...init, redirect: "manual" })
      : await nodeHttpsRequest(current, headers, signal);
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new PublicFetchError(502, "Некоректне перенаправлення");
      const next = checkPublicHttpUrl(new URL(location, current).toString());
      if (!next.ok) throw new PublicFetchError(400, next.error);
      current = next.url;
      continue;
    }
    return response;
  }
  throw new PublicFetchError(502, "Забагато перенаправлень");
}
