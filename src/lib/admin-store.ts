// Client-safe async facade over the DB-backed admin store.
// The real implementation lives in ./admin-store.server.ts and is loaded
// via dynamic import inside each function, so route files can import from
// here at module scope without pulling the service-role client into the
// client bundle.

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

export async function getSettings(): Promise<AdminSettings> {
  return (await impl()).getSettings();
}
export async function updateSettings(patch: Partial<AdminSettings>): Promise<AdminSettings> {
  return (await impl()).updateSettings(patch);
}
export async function resetSettings(): Promise<AdminSettings> {
  return (await impl()).resetSettings();
}
export async function isBlocked(ip: string): Promise<boolean> {
  return (await impl()).isBlocked(ip);
}
export async function listBlocked(): Promise<BlockedEntry[]> {
  return (await impl()).listBlocked();
}
export async function listUsers(limit?: number): Promise<UserSummary[]> {
  return (await impl()).listUsers(limit);
}
export async function blockIP(ip: string, reason?: string | null): Promise<void> {
  return (await impl()).blockIP(ip, reason);
}
export async function unblockIP(ip: string): Promise<void> {
  return (await impl()).unblockIP(ip);
}
export async function recordLog(entry: Omit<LookupLog, "id" | "ts">): Promise<void> {
  try {
    await (await impl()).recordLog(entry);
  } catch (e) {
    console.error("recordLog failed", e);
  }
}
export async function getVisitorCredits(ip: string): Promise<VisitorCredit | null> {
  return (await impl()).getVisitorCredits(ip);
}
export async function setVisitorCredits(ip: string, credits: number): Promise<VisitorCredit> {
  return (await impl()).setVisitorCredits(ip, credits);
}
export async function addVisitorCredits(ip: string, delta: number): Promise<VisitorCredit> {
  return (await impl()).addVisitorCredits(ip, delta);
}
export async function resetVisitorCredits(ip: string): Promise<void> {
  return (await impl()).resetVisitorCredits(ip);
}
export async function consumeLookupCredit(ip: string): Promise<{ ok: true; remaining: number | null } | { ok: false; remaining: number }> {
  return (await impl()).consumeLookupCredit(ip);
}
export async function listLogs(opts?: LogFilters): Promise<LookupLog[]> {
  return (await impl()).listLogs(opts);
}
export async function clearLogs(): Promise<void> {
  return (await impl()).clearLogs();
}
export async function statsSummary(): Promise<StatsSummary> {
  return (await impl()).statsSummary();
}
export async function analytics(): Promise<Analytics> {
  return (await impl()).analytics();
}
