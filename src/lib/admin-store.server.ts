// DB-backed admin store using service-role Supabase.
// Must ONLY be imported dynamically from server handlers (route/serverFn),
// never at module scope of client-reachable files.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LookupStatus =
  | "success"
  | "not_found"
  | "error"
  | "blocked"
  | "rate_limited"
  | "no_credits";

export type LookupLog = {
  id: string;
  ts: number;
  query: string;
  status: LookupStatus;
  ip: string;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
  referer?: string | null;
  mobileNumber?: string | null;
  responseTimeSeconds?: number | null;
  errorMessage?: string | null;
};

export type BlockedEntry = { ip: string; reason: string | null; createdAt: number };

export type AdminSettings = {
  originLockEnabled: boolean;
  perMinuteLimit: number;
  perHourLimit: number;
  tokenPerMinuteLimit: number;
  timingGateMs: number;
  discordEnabled: boolean;
  creditsEnabled: boolean;
  defaultCredits: number;
  creditsPerLookup: number;
};

export type VisitorCredit = { ip: string; credits: number; updatedAt: number };

export type UserSummary = {
  ip: string;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
  totalLookups: number;
  successfulLookups: number;
  failedLookups: number;
  firstSeen: number;
  lastSeen: number;
  blocked: boolean;
  blockReason?: string | null;
  credits: number | null;
  creditsUpdatedAt?: number | null;
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

/* ---------- small in-memory caches (per worker instance) ---------- */
const SETTINGS_TTL = 5_000;
const BLOCK_TTL = 5_000;
let settingsCache: { data: AdminSettings; at: number } | undefined;
let blockCache: { set: Set<string>; at: number } | undefined;

function invalidateSettings() { settingsCache = undefined; }
function invalidateBlocks() { blockCache = undefined; }

function cleanSettings(input: Partial<AdminSettings>): Partial<AdminSettings> {
  const out: Partial<AdminSettings> = {};
  if (typeof input.originLockEnabled === "boolean") out.originLockEnabled = input.originLockEnabled;
  if (typeof input.discordEnabled === "boolean") out.discordEnabled = input.discordEnabled;
  if (typeof input.creditsEnabled === "boolean") out.creditsEnabled = input.creditsEnabled;
  const nums: (keyof Pick<AdminSettings, "perMinuteLimit" | "perHourLimit" | "tokenPerMinuteLimit" | "timingGateMs" | "defaultCredits" | "creditsPerLookup">)[] = [
    "perMinuteLimit", "perHourLimit", "tokenPerMinuteLimit", "timingGateMs", "defaultCredits", "creditsPerLookup",
  ];
  for (const key of nums) {
    const v = Number(input[key]);
    if (Number.isFinite(v)) out[key] = Math.max(0, Math.floor(v)) as never;
  }
  if (out.perMinuteLimit === 0) out.perMinuteLimit = 1;
  if (out.perHourLimit === 0) out.perHourLimit = 1;
  if (out.tokenPerMinuteLimit === 0) out.tokenPerMinuteLimit = 1;
  if (out.creditsPerLookup === 0) out.creditsPerLookup = 1;
  return out;
}

/* ---------- settings ---------- */
export async function getSettings(): Promise<AdminSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL) return settingsCache.data;
  const { data } = await supabaseAdmin
    .from("admin_settings" as never)
    .select("key,value")
    .eq("key", "main")
    .maybeSingle();
  const stored = ((data as { value?: Partial<AdminSettings> } | null)?.value) ?? {};
  const merged: AdminSettings = { ...DEFAULTS, ...stored };
  settingsCache = { data: merged, at: Date.now() };
  return merged;
}

export async function updateSettings(patch: Partial<AdminSettings>): Promise<AdminSettings> {
  const cur = await getSettings();
  const next: AdminSettings = { ...cur, ...cleanSettings(patch) };
  await supabaseAdmin
    .from("admin_settings" as never)
    .upsert({ key: "main", value: next, updated_at: new Date().toISOString() } as never);
  invalidateSettings();
  return next;
}

export async function resetSettings(): Promise<AdminSettings> {
  await supabaseAdmin
    .from("admin_settings" as never)
    .upsert({ key: "main", value: DEFAULTS, updated_at: new Date().toISOString() } as never);
  invalidateSettings();
  return { ...DEFAULTS };
}

/* ---------- blocklist ---------- */
async function loadBlockSet(): Promise<Set<string>> {
  if (blockCache && Date.now() - blockCache.at < BLOCK_TTL) return blockCache.set;
  const { data } = await supabaseAdmin.from("blocked_ips" as never).select("ip");
  const s = new Set<string>(((data as { ip: string }[]) || []).map((r) => r.ip));
  blockCache = { set: s, at: Date.now() };
  return s;
}

export async function isBlocked(ip: string): Promise<boolean> {
  const set = await loadBlockSet();
  return set.has(ip);
}

export async function listBlocked(): Promise<BlockedEntry[]> {
  const { data } = await supabaseAdmin
    .from("blocked_ips" as never)
    .select("ip,reason,created_at")
    .order("created_at", { ascending: false });
  return ((data as { ip: string; reason: string | null; created_at: string }[]) || []).map((r) => ({
    ip: r.ip,
    reason: r.reason,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function blockIP(ip: string, reason?: string | null): Promise<void> {
  await supabaseAdmin
    .from("blocked_ips" as never)
    .upsert({ ip, reason: reason ?? null } as never);
  invalidateBlocks();
}

/* ---------- visitor credits ---------- */
function creditKey(ip: string): string {
  return `credits:${ip}`;
}

function normalizeCredits(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export async function getVisitorCredits(ip: string): Promise<VisitorCredit | null> {
  const { data } = await supabaseAdmin
    .from("admin_settings" as never)
    .select("key,value,updated_at")
    .eq("key", creditKey(ip))
    .maybeSingle();
  const row = data as { value?: { credits?: number }; updated_at?: string } | null;
  if (!row?.value) return null;
  return {
    ip,
    credits: normalizeCredits(row.value.credits),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

export async function setVisitorCredits(ip: string, credits: number): Promise<VisitorCredit> {
  const clean = normalizeCredits(credits);
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("admin_settings" as never)
    .upsert({ key: creditKey(ip), value: { credits: clean }, updated_at: now } as never);
  return { ip, credits: clean, updatedAt: new Date(now).getTime() };
}

export async function addVisitorCredits(ip: string, delta: number): Promise<VisitorCredit> {
  const settings = await getSettings();
  const current = await getVisitorCredits(ip);
  return setVisitorCredits(ip, (current?.credits ?? settings.defaultCredits) + Math.floor(delta));
}

export async function resetVisitorCredits(ip: string): Promise<void> {
  await supabaseAdmin.from("admin_settings" as never).delete().eq("key", creditKey(ip));
}

export async function consumeLookupCredit(ip: string): Promise<{ ok: true; remaining: number | null } | { ok: false; remaining: number }> {
  const settings = await getSettings();
  if (!settings.creditsEnabled) return { ok: true, remaining: null };
  const cost = Math.max(1, Math.floor(settings.creditsPerLookup || 1));
  const current = await getVisitorCredits(ip);
  const available = current?.credits ?? settings.defaultCredits;
  if (available < cost) return { ok: false, remaining: available };
  const next = await setVisitorCredits(ip, available - cost);
  return { ok: true, remaining: next.credits };
}

export async function unblockIP(ip: string): Promise<void> {
  await supabaseAdmin.from("blocked_ips" as never).delete().eq("ip", ip);
  invalidateBlocks();
}

/* ---------- logs ---------- */
type LogRow = {
  id: string;
  ts: string;
  query: string;
  status: LookupStatus;
  ip: string;
  country: string | null;
  city: string | null;
  user_agent: string | null;
  referer: string | null;
  mobile_number: string | null;
  response_time_seconds: number | null;
  error_message: string | null;
};

function rowToLog(r: LogRow): LookupLog {
  return {
    id: r.id,
    ts: new Date(r.ts).getTime(),
    query: r.query,
    status: r.status,
    ip: r.ip,
    country: r.country,
    city: r.city,
    userAgent: r.user_agent,
    referer: r.referer,
    mobileNumber: r.mobile_number,
    responseTimeSeconds: r.response_time_seconds,
    errorMessage: r.error_message,
  };
}

export async function recordLog(entry: Omit<LookupLog, "id" | "ts">): Promise<void> {
  await supabaseAdmin.from("lookup_logs" as never).insert({
    query: entry.query,
    status: entry.status,
    ip: entry.ip,
    country: entry.country ?? null,
    city: entry.city ?? null,
    user_agent: entry.userAgent ?? null,
    referer: entry.referer ?? null,
    mobile_number: entry.mobileNumber ?? null,
    response_time_seconds: entry.responseTimeSeconds ?? null,
    error_message: entry.errorMessage ?? null,
  } as never);
}

export type LogFilters = {
  limit?: number;
  status?: LookupStatus | "all";
  search?: string;
  ip?: string;
};

// only allow safe chars in ilike patterns (defense against PostgREST filter parsing)
function safeLike(s: string): string {
  return s.replace(/[^A-Za-z0-9.\-_+ ]/g, "").slice(0, 64);
}

export async function listLogs(opts: LogFilters = {}): Promise<LookupLog[]> {
  const limit = Math.min(Math.max(opts.limit || 200, 1), 500);
  let q = supabaseAdmin
    .from("lookup_logs" as never)
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);

  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.ip) q = q.eq("ip", opts.ip);
  if (opts.search) {
    const s = safeLike(opts.search);
    if (s) {
      q = q.or(
        `query.ilike.%${s}%,ip.ilike.%${s}%,mobile_number.ilike.%${s}%,country.ilike.%${s}%`,
      );
    }
  }

  const { data } = await q;
  return ((data as LogRow[]) || []).map(rowToLog);
}

export async function listUsers(limit = 200): Promise<UserSummary[]> {
  const rowsRes = await supabaseAdmin
    .from("lookup_logs" as never)
    .select("ts,query,status,ip,country,city,user_agent")
    .neq("ip", "admin")
    .order("ts", { ascending: false })
    .limit(5000);
  const blocked = await listBlocked();
  const blockMap = new Map(blocked.map((b) => [b.ip, b.reason]));

  const creditRows = await supabaseAdmin
    .from("admin_settings" as never)
    .select("key,value,updated_at")
    .like("key", "credits:%")
    .limit(5000);
  const creditMap = new Map<string, { credits: number; updatedAt: number }>();
  for (const row of ((creditRows.data as { key: string; value?: { credits?: number }; updated_at?: string }[]) || [])) {
    const ip = row.key.replace(/^credits:/, "");
    creditMap.set(ip, {
      credits: normalizeCredits(row.value?.credits),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    });
  }

  const users = new Map<string, UserSummary>();
  for (const row of ((rowsRes.data as { ts: string; status: LookupStatus; ip: string; country: string | null; city: string | null; user_agent: string | null }[]) || [])) {
    if (!row.ip) continue;
    const ts = new Date(row.ts).getTime();
    const existing = users.get(row.ip);
    if (!existing) {
      const credit = creditMap.get(row.ip);
      users.set(row.ip, {
        ip: row.ip,
        country: row.country,
        city: row.city,
        userAgent: row.user_agent,
        totalLookups: 1,
        successfulLookups: row.status === "success" ? 1 : 0,
        failedLookups: row.status === "success" ? 0 : 1,
        firstSeen: ts,
        lastSeen: ts,
        blocked: blockMap.has(row.ip),
        blockReason: blockMap.get(row.ip) ?? null,
        credits: credit?.credits ?? null,
        creditsUpdatedAt: credit?.updatedAt ?? null,
      });
    } else {
      existing.totalLookups += 1;
      if (row.status === "success") existing.successfulLookups += 1;
      else existing.failedLookups += 1;
      existing.firstSeen = Math.min(existing.firstSeen, ts);
      existing.lastSeen = Math.max(existing.lastSeen, ts);
      if (!existing.country && row.country) existing.country = row.country;
      if (!existing.city && row.city) existing.city = row.city;
      if (!existing.userAgent && row.user_agent) existing.userAgent = row.user_agent;
    }
  }

  for (const [ip, reason] of blockMap) {
    if (!users.has(ip)) {
      const credit = creditMap.get(ip);
      users.set(ip, {
        ip,
        totalLookups: 0,
        successfulLookups: 0,
        failedLookups: 0,
        firstSeen: 0,
        lastSeen: 0,
        blocked: true,
        blockReason: reason,
        credits: credit?.credits ?? null,
        creditsUpdatedAt: credit?.updatedAt ?? null,
      });
    }
  }

  for (const [ip, credit] of creditMap) {
    if (!users.has(ip)) {
      users.set(ip, {
        ip,
        totalLookups: 0,
        successfulLookups: 0,
        failedLookups: 0,
        firstSeen: 0,
        lastSeen: 0,
        blocked: blockMap.has(ip),
        blockReason: blockMap.get(ip) ?? null,
        credits: credit.credits,
        creditsUpdatedAt: credit.updatedAt,
      });
    }
  }

  return [...users.values()]
    .sort((a, b) => (b.lastSeen || b.creditsUpdatedAt || 0) - (a.lastSeen || a.creditsUpdatedAt || 0))
    .slice(0, Math.max(1, Math.min(limit, 500)));
}

export async function clearLogs(): Promise<void> {
  await supabaseAdmin
    .from("lookup_logs" as never)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
}

/* ---------- stats & analytics ---------- */
export type StatsSummary = {
  total: number;
  last24: number;
  lastHour: number;
  success: number;
  notFound: number;
  errors: number;
  uniqueIPs24h: number;
  blockedCount: number;
};

export async function statsSummary(): Promise<StatsSummary> {
  const now = Date.now();
  const dayISO = new Date(now - 24 * 3600 * 1000).toISOString();
  const hourISO = new Date(now - 3600 * 1000).toISOString();

  const [totalRes, blockedRes, last24Res, lastHourRes] = await Promise.all([
    supabaseAdmin.from("lookup_logs" as never).select("*", { count: "exact", head: true }),
    supabaseAdmin.from("blocked_ips" as never).select("*", { count: "exact", head: true }),
    supabaseAdmin.from("lookup_logs" as never).select("status,ip").gte("ts", dayISO).limit(5000),
    supabaseAdmin
      .from("lookup_logs" as never)
      .select("*", { count: "exact", head: true })
      .gte("ts", hourISO),
  ]);

  const rows = ((last24Res.data as { status: LookupStatus; ip: string }[]) || []);
  const success = rows.filter((l) => l.status === "success").length;
  const notFound = rows.filter((l) => l.status === "not_found").length;
  const errors = rows.filter((l) => l.status === "error").length;
  const uniqueIPs24h = new Set(rows.map((l) => l.ip)).size;

  return {
    total: totalRes.count ?? 0,
    last24: rows.length,
    lastHour: lastHourRes.count ?? 0,
    success,
    notFound,
    errors,
    uniqueIPs24h,
    blockedCount: blockedRes.count ?? 0,
  };
}

export type Analytics = {
  hourly: { hour: string; count: number; success: number; failed: number }[];
  topQueries: { key: string; count: number }[];
  topIPs: { key: string; count: number; country?: string | null }[];
  statusBreakdown: { status: LookupStatus; count: number }[];
};

export async function analytics(): Promise<Analytics> {
  const now = Date.now();
  const dayISO = new Date(now - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("lookup_logs" as never)
    .select("ts,query,ip,status,country")
    .gte("ts", dayISO)
    .limit(5000);

  const rows = (data as { ts: string; query: string; ip: string; status: LookupStatus; country: string | null }[]) || [];

  // hourly bucket for last 24h
  const buckets = new Array(24).fill(0).map((_, i) => {
    const d = new Date(now - (23 - i) * 3600 * 1000);
    return {
      hourTs: Math.floor(d.getTime() / 3600_000),
      label: d.getUTCHours().toString().padStart(2, "0") + ":00",
      count: 0,
      success: 0,
      failed: 0,
    };
  });
  const byHour = new Map(buckets.map((b, i) => [b.hourTs, i]));

  const byQ = new Map<string, number>();
  const byIp = new Map<string, { count: number; country: string | null }>();
  const byStatus = new Map<LookupStatus, number>();

  for (const r of rows) {
    const h = Math.floor(new Date(r.ts).getTime() / 3600_000);
    const idx = byHour.get(h);
    if (idx !== undefined) {
      buckets[idx].count += 1;
      if (r.status === "success") buckets[idx].success += 1;
      else buckets[idx].failed += 1;
    }
    if (r.query && r.query !== "-") byQ.set(r.query, (byQ.get(r.query) || 0) + 1);
    const cur = byIp.get(r.ip);
    byIp.set(r.ip, { count: (cur?.count ?? 0) + 1, country: r.country });
    byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count }));

  const topIPs = [...byIp.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([key, v]) => ({ key, count: v.count, country: v.country }));

  const statusBreakdown = [...byStatus.entries()].map(([status, count]) => ({ status, count }));

  return {
    hourly: buckets.map((b) => ({ hour: b.label, count: b.count, success: b.success, failed: b.failed })),
    topQueries: top(byQ),
    topIPs,
    statusBreakdown,
  };
}
