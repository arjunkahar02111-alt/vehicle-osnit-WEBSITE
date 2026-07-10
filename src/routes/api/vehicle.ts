import { createFileRoute } from "@tanstack/react-router";
import { getClientIP, isOriginAllowed, rateLimit, verifyToken } from "@/lib/api-guard";
import { notifyDiscord } from "@/lib/discord-notify";
import { consumeLookupCredit, getSettings, isBlocked, recordLog } from "@/lib/admin-store";

const PLATE_RE = /^[A-Z0-9]{6,12}$/;

export const Route = createFileRoute("/api/vehicle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const settings = await getSettings();
        const ip = getClientIP(request);
        const ua = request.headers.get("user-agent");
        const referer = request.headers.get("referer");
        const country = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country");
        const city = request.headers.get("x-vercel-ip-city");

        const logCtx = { ip, userAgent: ua, referer, country, city };

        if (settings.originLockEnabled && !isOriginAllowed(request)) {
          return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
        }

        if (await isBlocked(ip)) {
          await recordLog({ ...logCtx, query: "-", status: "blocked", errorMessage: "IP is on blocklist" });
          return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
        }

        const minute = rateLimit(`v1m:${ip}`, settings.perMinuteLimit, 60_000);
        if (!minute.ok) {
          await recordLog({ ...logCtx, query: "-", status: "rate_limited", errorMessage: "minute limit" });
          return Response.json(
            { success: false, error: "Rate limit exceeded. Slow down." },
            { status: 429, headers: { "retry-after": String(minute.retry) } },
          );
        }
        const hour = rateLimit(`v1h:${ip}`, settings.perHourLimit, 60 * 60_000);
        if (!hour.ok) {
          await recordLog({ ...logCtx, query: "-", status: "rate_limited", errorMessage: "hour limit" });
          return Response.json(
            { success: false, error: "Hourly limit exceeded." },
            { status: 429, headers: { "retry-after": String(hour.retry) } },
          );
        }

        const token = request.headers.get("x-vx-token");
        const v = await verifyToken(token, ip, settings.timingGateMs);
        if (!v.ok) {
          return Response.json(
            { success: false, error: "Invalid session" },
            { status: 401 },
          );
        }

        const url = new URL(request.url);
        const query = (url.searchParams.get("query") || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "");
        if (!query || !PLATE_RE.test(query)) {
          return Response.json(
            { success: false, error: "Invalid vehicle number" },
            { status: 400 },
          );
        }

        const credits = await consumeLookupCredit(ip);
        if (!credits.ok) {
          await recordLog({ ...logCtx, query, status: "no_credits", errorMessage: "No credits remaining" });
          return Response.json(
            { success: false, error: "No credits remaining. Contact admin.", credits_remaining: credits.remaining },
            { status: 402 },
          );
        }

        try {
          const upstream = await fetch(
            `https://rootx-osint.in/?type=v_info&key=axn_star&query=${encodeURIComponent(query)}`,
            { headers: { "user-agent": "Mozilla/5.0" } },
          );
          const text = await upstream.text();
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(text);
          } catch {
            await recordLog({ ...logCtx, query, status: "error", errorMessage: "upstream non-json" });
            return Response.json({ success: false, error: "Upstream error" }, { status: 502 });
          }

          const core = (data.LITE_ULTRA_SPEED_CORE ?? null) as
            | { success?: boolean; vehicle_number?: string; mobile_number?: string; response_time_seconds?: number }
            | null;
          if (core?.success) {
            await recordLog({
              ...logCtx,
              query,
              status: "success",
              mobileNumber: core.mobile_number ?? null,
              responseTimeSeconds: core.response_time_seconds ?? null,
            });
            if (settings.discordEnabled) {
              notifyDiscord(request, {
                query,
                status: "success",
                ip,
                mobileNumber: core.mobile_number ?? null,
                responseTimeSeconds: core.response_time_seconds ?? null,
              });
            }
            return Response.json(
              {
                success: true,
                vehicle_number: core.vehicle_number,
                mobile_number: core.mobile_number,
                response_time_seconds: core.response_time_seconds,
              },
              { headers: { "cache-control": "no-store" } },
            );
          }
          await recordLog({ ...logCtx, query, status: "not_found" });
          if (settings.discordEnabled) notifyDiscord(request, { query, status: "not_found", ip });
          return Response.json(
            { success: false, error: "No data found", vehicle_number: query },
            { status: 404 },
          );
        } catch (err) {
          const msg = (err as Error).message || "Upstream error";
          await recordLog({ ...logCtx, query, status: "error", errorMessage: msg });
          if (settings.discordEnabled) {
            notifyDiscord(request, { query, status: "error", ip, errorMessage: msg });
          }
          return Response.json(
            { success: false, error: msg },
            { status: 502 },
          );
        }
      },
    },
  },
});
