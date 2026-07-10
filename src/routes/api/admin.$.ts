import { createFileRoute } from "@tanstack/react-router";
import { createAdminToken, getAdminAuth, isAdminAuthed, timingSafeStringEq } from "@/lib/admin-session";
import {
  analytics,
  addVisitorCredits,
  blockIP,
  clearLogs,
  getSettings,
  listBlocked,
  listLogs,
  listUsers,
  recordLog,
  resetSettings,
  resetVisitorCredits,
  setVisitorCredits,
  statsSummary,
  unblockIP,
  updateSettings,
  type AdminSettings,
  type LogFilters,
  type LookupStatus,
} from "@/lib/admin-store";

function requireAuth(request: Request) {
  if (!isAdminAuthed(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

export const Route = createFileRoute("/api/admin/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const path = params._splat || "";
        if (path === "me") {
          const session = getAdminAuth(request);
          return Response.json({ authed: Boolean(session), session });
        }
        const un = requireAuth(request);
        if (un) return un;

        const url = new URL(request.url);

        if (path === "state") {
          const filters: LogFilters = {
            limit: Number(url.searchParams.get("limit")) || 200,
            status: (url.searchParams.get("status") as LookupStatus | "all") || "all",
            search: url.searchParams.get("q") || undefined,
            ip: url.searchParams.get("ip") || undefined,
          };
          const [stats, settings, logs, blocklist, users, ana] = await Promise.all([
            statsSummary(),
            getSettings(),
            listLogs(filters),
            listBlocked(),
            listUsers(200),
            analytics(),
          ]);
          return Response.json({ stats, settings, logs, blocklist, users, analytics: ana });
        }

        if (path === "users") {
          return Response.json({ users: await listUsers(Number(url.searchParams.get("limit")) || 200) });
        }

        if (path === "logs") {
          const filters: LogFilters = {
            limit: Number(url.searchParams.get("limit")) || 200,
            status: (url.searchParams.get("status") as LookupStatus | "all") || "all",
            search: url.searchParams.get("q") || undefined,
            ip: url.searchParams.get("ip") || undefined,
          };
          return Response.json({ logs: await listLogs(filters) });
        }

        if (path === "logs/export") {
          const rows = await listLogs({ limit: 500 });
          const header = [
            "time_iso", "query", "status", "ip", "country", "city",
            "mobile_number", "response_time_seconds", "referer", "user_agent", "error_message",
          ];
          const esc = (v: unknown) => {
            const s = v == null ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          };
          const body = [header.join(",")]
            .concat(rows.map((r) => [
              new Date(r.ts).toISOString(), r.query, r.status, r.ip,
              r.country ?? "", r.city ?? "", r.mobileNumber ?? "",
              r.responseTimeSeconds ?? "", r.referer ?? "", r.userAgent ?? "", r.errorMessage ?? "",
            ].map(esc).join(",")))
            .join("\n");
          return new Response(body, {
            status: 200,
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": `attachment; filename="vahanx-logs-${Date.now()}.csv"`,
            },
          });
        }

        return new Response("Not found", { status: 404 });
      },
      POST: async ({ request, params }) => {
        const path = params._splat || "";
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

        if (path === "login") {
          const password = String(body.password || "");
          const expected = process.env.ADMIN_PASSWORD || "";
          if (!expected) return Response.json({ ok: false, error: "Server not configured" }, { status: 500 });
          if (!password || !timingSafeStringEq(password, expected)) {
            await new Promise((r) => setTimeout(r, 400));
            return Response.json({ ok: false, error: "Wrong password" }, { status: 401 });
          }
          const session = createAdminToken();
          await recordLog({ ip: "admin", query: "-", status: "success", errorMessage: "admin login" });
          return Response.json({ ok: true, ...session });
        }

        if (path === "logout") {
          return Response.json({ ok: true });
        }

        const un = requireAuth(request);
        if (un) return un;

        if (path === "settings") {
          const patch = body as Partial<AdminSettings>;
          const s = await updateSettings(patch);
          return Response.json({ settings: s });
        }
        if (path === "settings/reset") {
          return Response.json({ settings: await resetSettings() });
        }
        if (path === "block") {
          const ip = String(body.ip || "").trim();
          const reason = body.reason ? String(body.reason).slice(0, 200) : null;
          if (!ip) return Response.json({ error: "ip required" }, { status: 400 });
          await blockIP(ip, reason);
          return Response.json({ blocklist: await listBlocked() });
        }
        if (path === "unblock") {
          const ip = String(body.ip || "").trim();
          await unblockIP(ip);
          return Response.json({ blocklist: await listBlocked() });
        }
        if (path === "credits") {
          const ip = String(body.ip || "").trim();
          const mode = String(body.mode || "set");
          const value = Number(body.credits ?? body.delta ?? 0);
          if (!ip) return Response.json({ error: "ip required" }, { status: 400 });
          if (mode === "add") await addVisitorCredits(ip, value);
          else if (mode === "reset") await resetVisitorCredits(ip);
          else await setVisitorCredits(ip, value);
          return Response.json({ users: await listUsers(200) });
        }
        if (path === "logs/clear") {
          await clearLogs();
          return Response.json({ ok: true });
        }
        return new Response("Not found", { status: 404 });
      },
    },
  },
});
