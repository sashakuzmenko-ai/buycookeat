import { lookup } from "node:dns/promises";

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
  if (url.protocol === "http:" && url.port === "80") return true;
  if (url.protocol === "https:" && url.port === "443") return true;
  return false;
}

/** Дозволені лише публічні http(s) URL без нестандартних портів. */
export function checkPublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Вкажіть адресу сторінки з рецептом" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Некоректна адреса" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Підтримуються лише адреси http або https" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Адреса з логіном і паролем не підтримується" };
  }
  if (hostBlocked(url.hostname)) {
    return { ok: false, error: "Локальні й приватні адреси заборонені" };
  }
  if (!portAllowed(url)) {
    return { ok: false, error: "Дозволені лише стандартні порти (80 і 443)" };
  }
  return { ok: true, url };
}

const MAX_REDIRECTS = 5;

/** Завантажує публічну сторінку без автоматичного follow — кожне перенаправлення перевіряється. */
export async function fetchPublicHttpResponse(
  url: URL,
  fetchImpl: typeof fetch,
  init: Omit<RequestInit, "redirect">,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicResolvableHost(current.hostname);
    const response = await fetchImpl(current.toString(), { ...init, redirect: "manual" });
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

export class PublicFetchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PublicFetchError";
    this.status = status;
  }
}
