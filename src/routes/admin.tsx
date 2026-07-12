import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, LogOut, RefreshCw, Trash2, Ban, Check, Settings2, Activity,
  Users, AlertTriangle, Loader2, Eye, EyeOff, Search, Download, X,
  BarChart3, ListOrdered, Globe, Radio, Filter, Coins,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type LookupStatus = "success" | "not_found" | "error" | "blocked" | "rate_limited" | "no_credits";
type LookupLog = {
  id: string; ts: number; query: string; status: LookupStatus;
  ip: string; country?: string | null; city?: string | null; userAgent?: string | null;
  referer?: string | null; mobileNumber?: string | null;
  responseTimeSeconds?: number | null; errorMessage?: string | null;
};
type AdminSettings = {
  originLockEnabled: boolean; perMinuteLimit: number; perHourLimit: number;
  tokenPerMinuteLimit: number; timingGateMs: number; discordEnabled: boolean;
  creditsEnabled: boolean; defaultCredits: number; creditsPerLookup: number;
};
type Stats = {
  total: number; last24: number; lastHour: number;
  success: number; notFound: number; errors: number;
  uniqueIPs24h: number; blockedCount: number;
};
type Blocked = { ip: string; reason: string | null; createdAt: number };
type UserSummary = {
  ip: string; country?: string | null; city?: string | null; userAgent?: string | null;
  totalLookups: number; successfulLookups: number; failedLookups: number;
  firstSeen: number; lastSeen: number; blocked: boolean; blockReason?: string | null;
  credits: number | null; creditsUpdatedAt?: number | null;
};
type Analytics = {
  hourly: { hour: string; count: number; success: number; failed: number }[];
  topQueries: { key: string; count: number }[];
  topIPs: { key: string; count: number; country?: string | null }[];
  statusBreakdown: { status: LookupStatus; count: number }[];
};
type State = {
  stats: Stats; settings: AdminSettings; logs: LookupLog[];
  blocklist: Blocked[]; users: UserSummary[]; analytics: Analytics;
  health?: { ok: boolean; persistent: boolean; mode: "database" | "memory"; message: string; lastError?: string };
};
const ADMIN_TOKEN_KEY = "vx_admin_session";

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `${res.status}`;
    try { message = JSON.parse(text).error || message; } catch { /* plain text */ }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ authed: boolean }>("me")
      .then((r) => {
        if (!r.authed) setAdminToken(null);
        setAuthed(r.authed);
      })
      .catch(() => { setAdminToken(null); setAuthed(false); });
  }, []);
  if (authed === null)
    return (
      <div className="grid min-h-screen place-items-center bg-[#050914] text-white">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
      </div>
    );
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await api<{ token: string }>("login", { method: "POST", body: JSON.stringify({ password }) });
      setAdminToken(r.token);
      onAuthed();
    } catch (e) { setErr((e as Error).message || "Login failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-[#050914] px-5 text-white">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
      >
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500">
            <Shield className="h-4 w-4 text-black" />
          </div>
          <div>
            <div className="font-bold">Admin</div>
            <div className="text-xs text-white/50">VahanX control panel</div>
          </div>
        </div>
        <label className="text-xs text-white/60">Password</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3">
          <input
            type={show ? "text" : "password"} value={password} autoFocus
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
          />
          <button type="button" onClick={() => setShow(!show)} className="text-white/40 hover:text-white">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {err && <div className="mt-3 text-xs text-red-300">{err}</div>}
        <button
          disabled={busy || !password}
          className="mt-4 w-full rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 py-2.5 text-sm font-bold text-black disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </motion.form>
    </div>
  );
}

type Tab = "overview" | "users" | "logs" | "blocklist" | "settings";

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  // logs filters (owned here so autoRefresh keeps them)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LookupStatus | "all">("all");
  const [ipFilter, setIpFilter] = useState<string>("");

  const [inspectLog, setInspectLog] = useState<LookupLog | null>(null);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (search.trim()) p.set("q", search.trim());
    if (ipFilter) p.set("ip", ipFilter);
    return p.toString();
  }, [search, statusFilter, ipFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<State>(`state?${buildQuery()}`);
      setState(s);
      setFetchErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setFetchErr((e as Error).message || "Failed to load");
    } finally { setLoading(false); }
  }, [buildQuery, onLogout]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh, live]);

  const logout = async () => {
    try { await api("logout", { method: "POST" }); } catch { /* ignore */ }
    setAdminToken(null);
    onLogout();
  };

  const block = async (ip: string, reason?: string) => {
    await api("block", { method: "POST", body: JSON.stringify({ ip, reason }) });
    refresh();
  };

  const unblock = async (ip: string) => {
    await api("unblock", { method: "POST", body: JSON.stringify({ ip }) });
    refresh();
  };

  const updateCredits = async (ip: string, mode: "set" | "add" | "reset", value = 0) => {
    await api("credits", { method: "POST", body: JSON.stringify({ ip, mode, credits: value, delta: value }) });
    refresh();
  };

  const exportCsv = async () => {
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/logs/export", {
        credentials: "same-origin",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new ApiError(res.status, await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vahanx-logs-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAdminToken(null);
        onLogout();
        return;
      }
      setFetchErr((e as Error).message || "Export failed");
    }
  };

  if (!state)
    return (
      <div className="grid min-h-screen place-items-center bg-[#050914] text-white">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
      </div>
    );

  return (
    <div className="min-h-screen bg-[#050914] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500">
              <Shield className="h-4 w-4 text-black" />
            </div>
            <div>
              <div className="text-sm font-bold">VahanX Admin</div>
              <div className="text-xs text-white/40">Control panel</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLive((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition ${
                live ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-white/60"
              }`}
              title="Auto-refresh every 6s"
            >
              <Radio className={`h-3.5 w-3.5 ${live ? "animate-pulse" : ""}`} />
              {live ? "Live" : "Paused"}
            </button>
            <button onClick={refresh} className="rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>

        {/* stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Lookups (24h)" value={state.stats.last24} icon={Activity} />
          <Stat label="Last hour" value={state.stats.lastHour} icon={Activity} />
          <Stat label="Unique IPs" value={state.stats.uniqueIPs24h} icon={Users} />
          <Stat label="Blocked IPs" value={state.stats.blockedCount} icon={Ban} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Success 24h" value={state.stats.success} tone="ok" />
          <Stat label="Not found" value={state.stats.notFound} tone="warn" />
          <Stat label="Errors" value={state.stats.errors} tone="err" />
        </div>

        {fetchErr && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {fetchErr}
          </div>
        )}

        {state.health && !state.health.persistent && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Temporary storage mode active</div>
                <div className="mt-0.5 text-amber-100/80">{state.health.message}</div>
                {state.health.lastError && (
                  <div className="mt-2 rounded-md border border-amber-300/20 bg-black/25 px-2 py-1 font-mono text-[11px] text-amber-50/80">
                    {state.health.lastError}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="mt-6 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.02] p-1 text-sm">
          {([
            ["overview", BarChart3, "Overview"],
            ["users", Users, "Users"],
            ["logs", Activity, "Logs"],
            ["blocklist", Ban, "Blocklist"],
            ["settings", Settings2, "Settings"],
          ] as const).map(([t, Icon, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                tab === t ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "overview" && <OverviewPanel analytics={state.analytics} onFilterIp={(ip) => { setIpFilter(ip); setTab("logs"); }} onBlock={(ip) => block(ip)} />}
          {tab === "users" && (
            <UsersPanel
              users={state.users}
              settings={state.settings}
              onFilterIp={(ip) => { setIpFilter(ip); setTab("logs"); }}
              onBlock={block}
              onUnblock={unblock}
              onCredits={updateCredits}
            />
          )}
          {tab === "logs" && (
            <LogsPanel
              logs={state.logs}
              search={search} setSearch={setSearch}
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              ipFilter={ipFilter} setIpFilter={setIpFilter}
              onCleared={refresh}
              onExport={exportCsv}
              onBlock={block}
              onInspect={setInspectLog}
            />
          )}
          {tab === "blocklist" && <BlocklistPanel list={state.blocklist} onChange={refresh} />}
          {tab === "settings" && <SettingsPanel settings={state.settings} onSaved={refresh} />}
        </div>
      </div>

      <AnimatePresence>
        {inspectLog && <LogInspector log={inspectLog} onClose={() => setInspectLog(null)} onBlock={(ip) => { block(ip); setInspectLog(null); }} />}
      </AnimatePresence>
    </div>
  );
}

function Stat({
  label, value, icon: Icon, tone,
}: { label: string; value: number; icon?: React.ElementType; tone?: "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "err" ? "text-red-300" : "text-cyan-300";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="flex items-center gap-2 text-xs text-white/50">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
    </motion.div>
  );
}

/* ---------------- Overview ---------------- */
function OverviewPanel({
  analytics, onFilterIp, onBlock,
}: {
  analytics: Analytics;
  onFilterIp: (ip: string) => void;
  onBlock: (ip: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-cyan-300" /> Lookups — last 24h
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.hourly}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hour" stroke="rgba(255,255,255,0.4)" fontSize={11} interval={2} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#0a0f1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#fff" }}
              />
              <Area type="monotone" dataKey="success" stroke="#22d3ee" fill="url(#g1)" strokeWidth={2} />
              <Area type="monotone" dataKey="failed" stroke="#f43f5e" fill="url(#g2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-center gap-4 text-[11px] text-white/50">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" /> success</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> failed</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <RankPanel
          title="Top vehicle queries" icon={ListOrdered}
          items={analytics.topQueries.map((q) => ({ label: q.key, count: q.count }))}
          emptyMsg="No lookups yet."
        />
        <RankPanel
          title="Top IPs" icon={Globe}
          items={analytics.topIPs.map((ip) => ({
            label: ip.key,
            hint: ip.country || undefined,
            count: ip.count,
            actions: (
              <div className="flex gap-1">
                <button
                  onClick={() => onFilterIp(ip.key)}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] hover:bg-white/10"
                >view</button>
                <button
                  onClick={() => onBlock(ip.key)}
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200 hover:bg-red-500/20"
                >block</button>
              </div>
            ),
          }))}
          emptyMsg="No traffic yet."
        />
      </div>
    </div>
  );
}

function RankPanel({
  title, icon: Icon, items, emptyMsg,
}: {
  title: string;
  icon: React.ElementType;
  items: { label: string; count: number; hint?: string; actions?: React.ReactNode }[];
  emptyMsg: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-semibold">
        <Icon className="h-4 w-4 text-fuchsia-300" /> {title}
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-white/40">{emptyMsg}</div>
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((it, i) => (
            <li key={i} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs">{it.label}</div>
                  {it.hint && <div className="text-[10px] text-white/40">{it.hint}</div>}
                </div>
                <div className="text-xs font-semibold text-cyan-300">{it.count}</div>
                {it.actions}
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/5">
                <div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500" style={{ width: `${(it.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Logs ---------------- */
const STATUS_OPTIONS: (LookupStatus | "all")[] = ["all", "success", "not_found", "error", "blocked", "rate_limited", "no_credits"];

/* ---------------- Users ---------------- */
function UsersPanel({
  users, settings, onFilterIp, onBlock, onUnblock, onCredits,
}: {
  users: UserSummary[];
  settings: AdminSettings;
  onFilterIp: (ip: string) => void;
  onBlock: (ip: string, reason?: string) => void;
  onUnblock: (ip: string) => void;
  onCredits: (ip: string, mode: "set" | "add" | "reset", value?: number) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = users.filter((u) => [u.ip, u.country, u.city, u.userAgent].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()));
  const creditLabel = (u: UserSummary) => {
    if (!settings.creditsEnabled) return "off";
    return String(u.credits ?? settings.defaultCredits);
  };
  const askSetCredits = (ip: string, current: number | null) => {
    const raw = prompt(`Set credits for ${ip}:`, String(current ?? settings.defaultCredits));
    if (raw === null) return;
    const n = Number(raw);
    if (Number.isFinite(n)) onCredits(ip, "set", n);
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Tracked users/IPs" value={users.length} icon={Users} />
        <Stat label="Blocked users" value={users.filter((u) => u.blocked).length} icon={Ban} tone="err" />
        <Stat label="Credit users" value={users.filter((u) => u.credits !== null).length} icon={Coins} tone="ok" />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3">
          <Search className="h-3.5 w-3.5 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search IP, country, city, device…"
            className="w-full bg-transparent py-2 text-sm focus:outline-none"
          />
          {q && <button onClick={() => setQ("")} className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/10 px-4 py-2 text-xs text-white/50">
          Showing {filtered.length} tracked {filtered.length === 1 ? "user" : "users"}
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0a0f1f] text-white/50">
              <tr>
                <th className="px-3 py-2">User/IP</th>
                <th className="px-3 py-2">Geo</th>
                <th className="px-3 py-2">Lookups</th>
                <th className="px-3 py-2">Credits</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-white/40">No users found.</td></tr>}
              {filtered.map((u) => (
                <tr key={u.ip} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <button onClick={() => onFilterIp(u.ip)} className="font-mono text-white/80 hover:text-cyan-300">{u.ip}</button>
                    <div className="mt-0.5 max-w-[260px] truncate text-[10px] text-white/35" title={u.userAgent || ""}>{u.userAgent || "unknown device"}</div>
                    {u.blocked && <div className="mt-1 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200">blocked{u.blockReason ? ` · ${u.blockReason}` : ""}</div>}
                  </td>
                  <td className="px-3 py-2 text-white/60">{[u.city, u.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-white">{u.totalLookups}</div>
                    <div className="text-[10px] text-white/40">{u.successfulLookups} ok · {u.failedLookups} fail</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className={`font-mono ${settings.creditsEnabled ? "text-emerald-300" : "text-white/40"}`}>{creditLabel(u)}</div>
                    {settings.creditsEnabled && u.credits === null && <div className="text-[10px] text-white/35">default</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-white/50">{u.lastSeen ? new Date(u.lastSeen).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => askSetCredits(u.ip, u.credits)} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20">set</button>
                      <button onClick={() => onCredits(u.ip, "add", 10)} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/20">+10</button>
                      <button onClick={() => onCredits(u.ip, "reset")} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] hover:bg-white/10">reset</button>
                      {u.blocked ? (
                        <button onClick={() => onUnblock(u.ip)} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] hover:bg-white/10">unblock</button>
                      ) : (
                        <button onClick={() => onBlock(u.ip, prompt(`Block ${u.ip}? Optional reason:`) || undefined)} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/20">block</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LogsPanel({
  logs, search, setSearch, statusFilter, setStatusFilter, ipFilter, setIpFilter,
  onCleared, onExport, onBlock, onInspect,
}: {
  logs: LookupLog[];
  search: string; setSearch: (v: string) => void;
  statusFilter: LookupStatus | "all"; setStatusFilter: (v: LookupStatus | "all") => void;
  ipFilter: string; setIpFilter: (v: string) => void;
  onCleared: () => void;
  onExport: () => void;
  onBlock: (ip: string, reason?: string) => void;
  onInspect: (l: LookupLog) => void;
}) {
  const clear = async () => {
    if (!confirm("Clear ALL lookup logs? This cannot be undone.")) return;
    await api("logs/clear", { method: "POST" });
    onCleared();
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3">
            <Search className="h-3.5 w-3.5 text-white/40" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search query, IP, mobile, country…"
              className="w-full bg-transparent py-2 text-sm focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2">
              <Filter className="h-3.5 w-3.5 text-white/40" />
              <select
                value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LookupStatus | "all")}
                className="bg-transparent py-2 text-xs focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-[#0a0f1f]">{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <button onClick={onExport} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={clear} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </div>
        {ipFilter && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-200">
            filtered by IP <span className="font-mono">{ipFilter}</span>
            <button onClick={() => setIpFilter("")} className="text-cyan-100 hover:text-white"><X className="h-3 w-3" /></button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/10 px-4 py-2 text-xs text-white/50">
          Showing {logs.length} {logs.length === 1 ? "entry" : "entries"}
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0a0f1f] text-white/50">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Query</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Geo</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-white/40">No lookups match these filters.</td></tr>
              )}
              {logs.map((l) => (
                <motion.tr
                  key={l.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="border-t border-white/5 hover:bg-white/[0.03]"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-white/50">{new Date(l.ts).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono">{l.query}</td>
                  <td className="px-3 py-2"><StatusPill status={l.status} /></td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setIpFilter(l.ip)}
                      className="font-mono text-white/70 hover:text-cyan-300"
                      title="Filter by this IP"
                    >{l.ip}</button>
                  </td>
                  <td className="px-3 py-2 text-white/60">{[l.city, l.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-white/50" title={l.mobileNumber || l.errorMessage || ""}>
                    {l.mobileNumber ? `📱 ${l.mobileNumber}` : l.errorMessage || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => onInspect(l)}
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] hover:bg-white/10"
                        title="Inspect"
                      >…</button>
                      {l.ip !== "admin" && (
                        <button
                          onClick={() => {
                            const reason = prompt(`Block ${l.ip}? Optional reason:`) ?? undefined;
                            if (reason !== null && reason !== undefined) onBlock(l.ip, reason || undefined);
                          }}
                          className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/20"
                        >
                          <Ban className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: LookupStatus }) {
  const map: Record<LookupStatus, string> = {
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    not_found: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    error: "bg-red-500/15 text-red-300 border-red-500/30",
    blocked: "bg-red-500/20 text-red-200 border-red-500/40",
    rate_limited: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    no_credits: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${map[status]}`}>{status.replace("_", " ")}</span>;
}

/* ---------------- Log inspector modal ---------------- */
function LogInspector({ log, onClose, onBlock }: { log: LookupLog; onClose: () => void; onBlock: (ip: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0f1f] p-5 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-white/50">Lookup detail</div>
            <div className="mt-0.5 font-mono text-lg">{log.query}</div>
          </div>
          <button onClick={onClose} className="rounded-md border border-white/10 bg-white/5 p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Field label="Status"><StatusPill status={log.status} /></Field>
          <Field label="Time">{new Date(log.ts).toLocaleString()}</Field>
          <Field label="IP" mono>{log.ip}</Field>
          <Field label="Geo">{[log.city, log.country].filter(Boolean).join(", ") || "—"}</Field>
          <Field label="Mobile" mono>{log.mobileNumber || "—"}</Field>
          <Field label="Response">{log.responseTimeSeconds ? `${log.responseTimeSeconds.toFixed(2)}s` : "—"}</Field>
        </div>
        <div className="mt-3 space-y-2 text-xs">
          <Field label="Referer" full>{log.referer || "—"}</Field>
          <Field label="User agent" full mono>{log.userAgent || "—"}</Field>
          {log.errorMessage && <Field label="Error" full>{log.errorMessage}</Field>}
        </div>
        {log.ip !== "admin" && (
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10">Close</button>
            <button
              onClick={() => {
                const reason = prompt(`Block ${log.ip}? Optional reason:`) ?? "";
                onBlock(log.ip);
                void reason;
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            >
              <Ban className="h-3.5 w-3.5" /> Block IP
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
function Field({ label, children, mono, full }: { label: string; children: React.ReactNode; mono?: boolean; full?: boolean }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-white/[0.03] p-2.5 ${full ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={`mt-0.5 break-all text-xs ${mono ? "font-mono" : ""}`}>{children}</div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsPanel({ settings, onSaved }: { settings: AdminSettings; onSaved: () => void }) {
  const [s, setS] = useState<AdminSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setS(settings), [settings]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api("settings", { method: "POST", body: JSON.stringify(s) });
      setSaved(true); onSaved();
      setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  };
  const reset = async () => {
    if (!confirm("Reset all settings to defaults?")) return;
    const r = await api<{ settings: AdminSettings }>("settings/reset", { method: "POST" });
    setS(r.settings); onSaved();
  };

  const num = (k: keyof AdminSettings, label: string, hint?: string) => (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <label className="text-xs text-white/60">{label}</label>
      <input
        type="number" min={0} value={s[k] as number}
        onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
        className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm font-mono focus:border-cyan-400/60 focus:outline-none"
      />
      {hint && <div className="mt-1 text-[11px] text-white/40">{hint}</div>}
    </div>
  );
  const toggle = (k: keyof AdminSettings, label: string, hint?: string) => (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-white/40">{hint}</div>}
      </div>
      <input
        type="checkbox" checked={s[k] as boolean}
        onChange={(e) => setS({ ...s, [k]: e.target.checked })}
        className="h-4 w-4 accent-cyan-400"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {toggle("originLockEnabled", "Origin lock", "Reject requests from other websites.")}
        {toggle("discordEnabled", "Discord webhook", "Send lookup events to Discord.")}
        {toggle("creditsEnabled", "Credit limit", "When enabled, every valid lookup deducts credits from that user/IP.")}
        {num("perMinuteLimit", "Lookups / minute / IP")}
        {num("perHourLimit", "Lookups / hour / IP")}
        {num("tokenPerMinuteLimit", "Token requests / minute / IP")}
        {num("timingGateMs", "Timing gate (ms)", "Min age of token before it's accepted. Slows bots.")}
        {num("defaultCredits", "Default credits / new user")}
        {num("creditsPerLookup", "Credits charged / lookup")}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          <Settings2 className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={reset} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10">
          Reset to defaults
        </button>
        {saved && <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> Saved</span>}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs text-emerald-200/80">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <div>Settings, logs and blocklist are persisted in Lovable Cloud and survive restarts and redeploys.</div>
      </div>
    </div>
  );
}

/* ---------------- Blocklist ---------------- */
function BlocklistPanel({ list, onChange }: { list: Blocked[]; onChange: () => void }) {
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) return;
    setBusy(true);
    try {
      await api("block", { method: "POST", body: JSON.stringify({ ip: ip.trim(), reason: reason.trim() || null }) });
      setIp(""); setReason(""); onChange();
    } finally { setBusy(false); }
  };
  const remove = async (x: string) => {
    await api("unblock", { method: "POST", body: JSON.stringify({ ip: x }) });
    onChange();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={ip} onChange={(e) => setIp(e.target.value)}
          placeholder="IP e.g. 203.0.113.10"
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono focus:border-cyan-400/60 focus:outline-none"
        />
        <input
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-cyan-400/60 focus:outline-none"
        />
        <button
          disabled={busy || !ip.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          <Ban className="h-4 w-4" /> Block
        </button>
      </form>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/10 px-4 py-2 text-xs text-white/50">Blocked IPs ({list.length})</div>
        {list.length === 0 ? (
          <div className="p-6 text-center text-sm text-white/40">No blocked IPs.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {list.map((x) => (
              <li key={x.ip} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-mono">{x.ip}</div>
                  <div className="text-[11px] text-white/40">
                    {new Date(x.createdAt).toLocaleString()}{x.reason ? ` · ${x.reason}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => remove(x.ip)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                >
                  <Check className="h-3.5 w-3.5" /> Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// silence unused-import warning for hooks kept for future use
void useMemo; void useRef;
