// Client-safe async facade over the DB-backed admin store.
// If the deployed host is missing backend admin credentials, every operation
// falls back to an in-memory store so the admin panel and lookup API do not
// crash. Persistent mode resumes automatically when the backend is configured.

import type {
  AdminSettings,
  Analytics,
  BlockedEntry,
  LogFilters,
  LookupLog,
  LookupStatus,
  StatsSummary,
  UserSummary,
  VisitorCredit,
} from "./admin-store.server";

export type {
  AdminSettings,
  Analytics,
  BlockedEntry,
  LogFilters,
  LookupLog,
  LookupStatus,
  StatsSummary,
  UserSummary,
  VisitorCredit,
};

type Impl = typeof import("./admin-store.server");
let _impl: Promise<Impl> | undefined;
function impl(): Promise<Impl> {
  if (!_impl) _impl = import("./admin-store.server");
  return _impl;
}

export type AdminStoreHealth = {
  ok: boolean;
  persistent: boolean;
  mode: "database" | "memory";
  message: string;
  lastError?: string;
};

const DEFAULTS: AdminSettings = {
  originLockEnabled: true,
  perMinuteLimit: 10,
  perHourLimit: 60,
  tokenPerMinuteLimit: 30,
  timingGateMs: 250,
  discordEnabled: true,
  creditsEnabled: false,
  defaultCredits: 5,
  creditsPerLookup: 1,
};

const memory = {
  settings: { ...DEFAULTS },
  logs: [] as LookupLog[],
  blocks: new Map<string, BlockedEntry>(),
  credits: new Map<string, VisitorCredit>(),
};

let lastStoreError: string | undefined;
let hasWarned = false;

function adminStoreMessage(error?: string) {
  if (!error) {
    return "Admin is running in memory fallback mode because persistent backend storage is not connected.";
  }

  const e = error.toLowerCase();
  if (e.includes("missing supabase environment variable")) {
    return "Your host still cannot see the required backend environment variable. Add it in Vercel for Production, Preview, and Development, then redeploy.";
  }
  if (e.includes("invalid api key") || e.includes("invalid jwt") || e.includes("expected 3 parts") || e.includes("jwt")) {
    return "The backend admin key on your host is invalid or the public key was pasted by mistake. Add the real backend admin key, then redeploy.";
  }
  if (e.includes("permission denied")) {
    return "The backend key can connect, but it does not have admin access. Recheck that the real backend admin key is saved on the host, not the public key.";
  }
  if (e.includes("relation") && e.includes("does not exist")) {
    return "The admin database tables are missing on the connected backend. Run the project database migrations, then redeploy.";
  }
  if (e.includes("fetch failed") || e.includes("network") || e.includes("failed to fetch")) {
    return "The host cannot reach the backend URL. Check the backend URL environment variable and redeploy.";
  }

  return "Admin is running in memory fallback mode because persistent backend storage returned an error.";
}

function markStoreError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown backend error");
  lastStoreError = message;
  if (!hasWarned) {
    hasWarned = true;
    console.error("Admin persistent store unavailable; using memory fallback", error);
  }
}

type PersistentResult<T> = { ok: true; value: T } | { ok: false };

async function persistent<T>(fn: (store: Impl) => Promise<T>): Promise<PersistentResult<T>> {
  try {
    return { ok: true, value: await fn(await impl()) };
  } catch (error) {
    markStoreError(error);
    return { ok: false };
  }
}

function cleanNumber(value: unknown, fallback: number, min = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback;
}

function cleanSettings(input: Partial<AdminSettings>): Partial<AdminSettings> {
  const out: Partial<AdminSettings> = {};
  if (typeof input.originLockEnabled === "boolean") out.originLockEnabled = input.originLockEnabled;
  if (typeof input.discordEnabled === "boolean") out.discordEnabled = input.discordEnabled;
  if (typeof input.creditsEnabled === "boolean") out.creditsEnabled = input.creditsEnabled;
  if ("perMinuteLimit" in input) out.perMinuteLimit = cleanNumber(input.perMinuteLimit, memory.settings.perMinuteLimit, 1);
  if ("perHourLimit" in input) out.perHourLimit = cleanNumber(input.perHourLimit, memory.settings.perHourLimit, 1);
  if ("tokenPerMinuteLimit" in input) out.tokenPerMinuteLimit = cleanNumber(input.tokenPerMinuteLimit, memory.settings.tokenPerMinuteLimit, 1);
  if ("timingGateMs" in input) out.timingGateMs = cleanNumber(input.timingGateMs, memory.settings.timingGateMs, 0);
  if ("defaultCredits" in input) out.defaultCredits = cleanNumber(input.defaultCredits, memory.settings.defaultCredits, 0);
  if ("creditsPerLookup" in input) out.creditsPerLookup = cleanNumber(input.creditsPerLookup, memory.settings.creditsPerLookup, 1);
  return out;
}

function limitedLogs(opts: LogFilters = {}) {
  const limit = Math.min(Math.max(opts.limit || 200, 1), 500);
  const search = opts.search?.trim().toLowerCase();
  return memory.logs
    .filter((log) => !opts.ip || log.ip === opts.ip)
    .filter((log) => !opts.status || opts.status === "all" || log.status === opts.status)
    .filter((log) => {
      if (!search) return true;
      return [log.query, log.ip, log.mobileNumber, log.country, log.city, log.errorMessage]
        .some((value) => String(value || "").toLowerCase().includes(search));
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

function usersFromMemory(limit = 200): UserSummary[] {
  const users = new Map<string, UserSummary>();
  for (const log of memory.logs.filter((l) => l.ip && l.ip !== "admin")) {
    const existing = users.get(log.ip);
    if (!existing) {
      const credit = memory.credits.get(log.ip);
      users.set(log.ip, {
        ip: log.ip,
        country: log.country,
        city: log.city,
        userAgent: log.userAgent,
        totalLookups: 1,
        successfulLookups: log.status === "success" ? 1 : 0,
        failedLookups: log.status === "success" ? 0 : 1,
        firstSeen: log.ts,
        lastSeen: log.ts,
        blocked: memory.blocks.has(log.ip),
        blockReason: memory.blocks.get(log.ip)?.reason ?? null,
        credits: credit?.credits ?? null,
        creditsUpdatedAt: credit?.updatedAt ?? null,
      });
    } else {
      existing.totalLookups += 1;
      if (log.status === "success") existing.successfulLookups += 1;
      else existing.failedLookups += 1;
      existing.firstSeen = Math.min(existing.firstSeen, log.ts);
      existing.lastSeen = Math.max(existing.lastSeen, log.ts);
      if (!existing.country && log.country) existing.country = log.country;
      if (!existing.city && log.city) existing.city = log.city;
      if (!existing.userAgent && log.userAgent) existing.userAgent = log.userAgent;
    }
  }
  for (const [ip, block] of memory.blocks) {
    if (!users.has(ip)) {
      const credit = memory.credits.get(ip);
      users.set(ip, {
        ip,
        totalLookups: 0,
        successfulLookups: 0,
        failedLookups: 0,
        firstSeen: 0,
        lastSeen: 0,
        blocked: true,
        blockReason: block.reason,
        credits: credit?.credits ?? null,
        creditsUpdatedAt: credit?.updatedAt ?? null,
      });
    }
  }
  for (const [ip, credit] of memory.credits) {
    if (!users.has(ip)) {
      users.set(ip, {
        ip,
        totalLookups: 0,
        successfulLookups: 0,
        failedLookups: 0,
        firstSeen: 0,
        lastSeen: 0,
        blocked: memory.blocks.has(ip),
        blockReason: memory.blocks.get(ip)?.reason ?? null,
        credits: credit.credits,
        creditsUpdatedAt: credit.updatedAt,
      });
    }
  }
  return [...users.values()]
    .sort((a, b) => (b.lastSeen || b.creditsUpdatedAt || 0) - (a.lastSeen || a.creditsUpdatedAt || 0))
    .slice(0, Math.max(1, Math.min(limit, 500)));
}

function memoryStats(): StatsSummary {
  const now = Date.now();
  const day = now - 24 * 3600_000;
  const hour = now - 3600_000;
  const rows = memory.logs.filter((l) => l.ts >= day);
  return {
    total: memory.logs.length,
    last24: rows.length,
    lastHour: memory.logs.filter((l) => l.ts >= hour).length,
    success: rows.filter((l) => l.status === "success").length,
    notFound: rows.filter((l) => l.status === "not_found").length,
    errors: rows.filter((l) => l.status === "error").length,
    uniqueIPs24h: new Set(rows.map((l) => l.ip)).size,
    blockedCount: memory.blocks.size,
  };
}

function memoryAnalytics(): Analytics {
  const now = Date.now();
  const day = now - 24 * 3600_000;
  const rows = memory.logs.filter((l) => l.ts >= day);
  const buckets = new Array(24).fill(0).map((_, i) => {
    const d = new Date(now - (23 - i) * 3600_000);
    return { hourTs: Math.floor(d.getTime() / 3600_000), hour: String(d.getUTCHours()).padStart(2, "0") + ":00", count: 0, success: 0, failed: 0 };
  });
  const byHour = new Map(buckets.map((b, i) => [b.hourTs, i]));
  const byQ = new Map<string, number>();
  const byIp = new Map<string, { count: number; country?: string | null }>();
  const byStatus = new Map<LookupStatus, number>();
  for (const row of rows) {
    const idx = byHour.get(Math.floor(row.ts / 3600_000));
    if (idx !== undefined) {
      buckets[idx].count += 1;
      if (row.status === "success") buckets[idx].success += 1;
      else buckets[idx].failed += 1;
    }
    if (row.query && row.query !== "-") byQ.set(row.query, (byQ.get(row.query) || 0) + 1);
    const cur = byIp.get(row.ip);
    byIp.set(row.ip, { count: (cur?.count || 0) + 1, country: row.country });
    byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count }));
  return {
    hourly: buckets.map(({ hour, count, success, failed }) => ({ hour, count, success, failed })),
    topQueries: top(byQ),
    topIPs: [...byIp.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([key, v]) => ({ key, count: v.count, country: v.country })),
    statusBreakdown: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
  };
}

export async function getSettings(): Promise<AdminSettings> {
  const saved = await persistent((s) => s.getSettings());
  return saved.ok ? saved.value : { ...memory.settings };
}
export async function updateSettings(patch: Partial<AdminSettings>): Promise<AdminSettings> {
  const saved = await persistent((s) => s.updateSettings(patch));
  if (saved.ok) return saved.value;
  memory.settings = { ...memory.settings, ...cleanSettings(patch) };
  return { ...memory.settings };
}
export async function resetSettings(): Promise<AdminSettings> {
  const saved = await persistent((s) => s.resetSettings());
  if (saved.ok) return saved.value;
  memory.settings = { ...DEFAULTS };
  return { ...memory.settings };
}
export async function isBlocked(ip: string): Promise<boolean> {
  const saved = await persistent((s) => s.isBlocked(ip));
  return saved.ok ? saved.value : memory.blocks.has(ip);
}
export async function listBlocked(): Promise<BlockedEntry[]> {
  const saved = await persistent((s) => s.listBlocked());
  return saved.ok ? saved.value : [...memory.blocks.values()].sort((a, b) => b.createdAt - a.createdAt);
}
export async function listUsers(limit?: number): Promise<UserSummary[]> {
  const saved = await persistent((s) => s.listUsers(limit));
  return saved.ok ? saved.value : usersFromMemory(limit);
}
export async function blockIP(ip: string, reason?: string | null): Promise<void> {
  const saved = await persistent((s) => s.blockIP(ip, reason));
  if (saved.ok) return;
  memory.blocks.set(ip, { ip, reason: reason ?? null, createdAt: Date.now() });
}
export async function unblockIP(ip: string): Promise<void> {
  const saved = await persistent((s) => s.unblockIP(ip));
  if (saved.ok) return;
  memory.blocks.delete(ip);
}
export async function recordLog(entry: Omit<LookupLog, "id" | "ts">): Promise<void> {
  const saved = await persistent((s) => s.recordLog(entry));
  if (saved.ok) return;
  memory.logs.unshift({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    ts: Date.now(),
    ...entry,
  });
  if (memory.logs.length > 5_000) memory.logs.length = 5_000;
}
export async function getVisitorCredits(ip: string): Promise<VisitorCredit | null> {
  const saved = await persistent((s) => s.getVisitorCredits(ip));
  return saved.ok ? saved.value : memory.credits.get(ip) ?? null;
}
export async function setVisitorCredits(ip: string, credits: number): Promise<VisitorCredit> {
  const saved = await persistent((s) => s.setVisitorCredits(ip, credits));
  if (saved.ok) return saved.value;
  const row = { ip, credits: cleanNumber(credits, 0, 0), updatedAt: Date.now() };
  memory.credits.set(ip, row);
  return row;
}
export async function addVisitorCredits(ip: string, delta: number): Promise<VisitorCredit> {
  const saved = await persistent((s) => s.addVisitorCredits(ip, delta));
  if (saved.ok) return saved.value;
  const current = memory.credits.get(ip)?.credits ?? memory.settings.defaultCredits;
  return setVisitorCredits(ip, current + Math.floor(Number(delta) || 0));
}
export async function resetVisitorCredits(ip: string): Promise<void> {
  const saved = await persistent((s) => s.resetVisitorCredits(ip));
  if (saved.ok) return;
  memory.credits.delete(ip);
}
export async function consumeLookupCredit(ip: string): Promise<{ ok: true; remaining: number | null } | { ok: false; remaining: number }> {
  const saved = await persistent((s) => s.consumeLookupCredit(ip));
  if (saved.ok) return saved.value;
  if (!memory.settings.creditsEnabled) return { ok: true, remaining: null };
  const cost = Math.max(1, Math.floor(memory.settings.creditsPerLookup || 1));
  const available = memory.credits.get(ip)?.credits ?? memory.settings.defaultCredits;
  if (available < cost) return { ok: false, remaining: available };
  const next = await setVisitorCredits(ip, available - cost);
  return { ok: true, remaining: next.credits };
}
export async function listLogs(opts?: LogFilters): Promise<LookupLog[]> {
  const saved = await persistent((s) => s.listLogs(opts));
  return saved.ok ? saved.value : limitedLogs(opts);
}
export async function clearLogs(): Promise<void> {
  const saved = await persistent((s) => s.clearLogs());
  if (saved.ok) return;
  memory.logs = [];
}
export async function statsSummary(): Promise<StatsSummary> {
  const saved = await persistent((s) => s.statsSummary());
  return saved.ok ? saved.value : memoryStats();
}
export async function analytics(): Promise<Analytics> {
  const saved = await persistent((s) => s.analytics());
  return saved.ok ? saved.value : memoryAnalytics();
}

export async function adminStoreHealth(): Promise<AdminStoreHealth> {
  const ok = await persistent(async (s) => {
    await s.getSettings();
    return true;
  });
  if (ok.ok) {
    lastStoreError = undefined;
    return { ok: true, persistent: true, mode: "database", message: "Persistent backend storage is connected." };
  }
  return {
    ok: true,
    persistent: false,
    mode: "memory",
    message: adminStoreMessage(lastStoreError),
    lastError: lastStoreError,
  };
}
