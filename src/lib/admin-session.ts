import { createHmac } from "node:crypto";

export type AdminSessionData = { authed: boolean; since: number; expiresAt: number };

const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function adminSecret(): string {
  const p = process.env.ADMIN_SESSION_SECRET;
  if (!p) throw new Error("ADMIN_SESSION_SECRET missing");
  return p;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", adminSecret()).update(payload).digest("base64url");
}

function readBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-admin-session")?.trim() || null;
}

export function createAdminToken(): { token: string; since: number; expiresAt: number } {
  const since = Date.now();
  const expiresAt = since + ADMIN_TOKEN_TTL_MS;
  const payload = b64url(JSON.stringify({ authed: true, since, expiresAt } satisfies AdminSessionData));
  return { token: `v1.${payload}.${sign(payload)}`, since, expiresAt };
}

export function verifyAdminToken(token: string | null): AdminSessionData | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, sig] = parts;
  if (!timingSafeStringEq(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(fromB64url(payload)) as Partial<AdminSessionData>;
    if (!data.authed || !data.since || !data.expiresAt) return null;
    if (Date.now() > data.expiresAt) return null;
    return { authed: true, since: data.since, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

export function getAdminAuth(request: Request): AdminSessionData | null {
  return verifyAdminToken(readBearer(request));
}

export function isAdminAuthed(request: Request): boolean {
  return Boolean(getAdminAuth(request));
}

export function timingSafeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
