// Shared anti-scrape helpers for API routes.
// Runs in the Cloudflare worker runtime (Web Crypto available).

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0"
  );
}

const ALLOWED_HOST_SUFFIXES = [
  "lovable.app",
  "lovableproject.com",
  "lovable.dev",
  "localhost",
  "127.0.0.1",
];

export function isOriginAllowed(request: Request): boolean {
  const host = request.headers.get("host") || "";
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const check = (v: string | null) => {
    if (!v) return false;
    try {
      const h = new URL(v).host;
      if (host && h === host) return true;
      const bare = h.split(":")[0];
      return ALLOWED_HOST_SUFFIXES.some(
        (s) => bare === s || bare.endsWith(`.${s}`),
      );
    } catch {
      return false;
    }
  };
  return check(origin) || check(referer);
}

const TOKEN_TTL_MS = 2 * 60 * 1000; // 2 minutes
// timing gate is now dynamic (see admin settings); this remains the default

// nonce tracking (single-use); per-worker-instance best-effort
const usedNonces = new Map<string, number>();
function pruneNonces(now: number) {
  if (usedNonces.size < 500) return;
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n);
}

// per-IP rate limit (per-worker-instance)
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
export function rateLimit(ip: string, limit: number, windowMs: number): { ok: boolean; retry: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + windowMs });
    return { ok: true, retry: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, retry: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, retry: 0 };
}

function randomNonce(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

function requireSecret(): string {
  const s = process.env.API_SIGNING_SECRET;
  if (!s) throw new Error("API_SIGNING_SECRET missing");
  return s;
}

export async function issueToken(ip: string): Promise<{ token: string; expires: number }> {
  const secret = requireSecret();
  const ts = Date.now();
  const nonce = randomNonce();
  const payload = `${ts}.${nonce}.${ip}`;
  const sig = await hmac(secret, payload);
  return { token: `${ts}.${nonce}.${sig}`, expires: ts + TOKEN_TTL_MS };
}

export async function verifyToken(token: string | null, ip: string, minAgeMs = 250): Promise<{ ok: boolean; reason?: string }> {
  if (!token) return { ok: false, reason: "missing token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad token" };
  const [tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad ts" };
  const now = Date.now();
  if (now - ts > TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  if (now - ts < minAgeMs) return { ok: false, reason: "too fast" };
  const secret = requireSecret();
  const expect = await hmac(secret, `${ts}.${nonce}.${ip}`);
  if (!timingSafeEqual(sig, expect)) return { ok: false, reason: "bad sig" };
  pruneNonces(now);
  if (usedNonces.has(nonce)) return { ok: false, reason: "reused" };
  usedNonces.set(nonce, ts + TOKEN_TTL_MS);
  return { ok: true };
}
