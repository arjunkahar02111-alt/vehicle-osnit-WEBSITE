import { createFileRoute } from "@tanstack/react-router";
import { getClientIP, isOriginAllowed, issueToken, rateLimit } from "@/lib/api-guard";
import { getSettings, isBlocked } from "@/lib/admin-store";

export const Route = createFileRoute("/api/token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const settings = await getSettings();
        if (settings.originLockEnabled && !isOriginAllowed(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        const ip = getClientIP(request);
        if (await isBlocked(ip)) {
          return new Response("Forbidden", { status: 403 });
        }
        const rl = rateLimit(`tok:${ip}`, settings.tokenPerMinuteLimit, 60_000);
        if (!rl.ok) {
          return new Response("Too many requests", {
            status: 429,
            headers: { "retry-after": String(rl.retry) },
          });
        }
        const { token, expires } = await issueToken(ip);
        return Response.json(
          { token, expires },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
