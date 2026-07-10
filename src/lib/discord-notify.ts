// Fire-and-forget Discord webhook notifier.
// Set DISCORD_WEBHOOK_URL as an environment variable (e.g. on Vercel) to enable.
// If the env var is missing, this is a no-op so local/dev never breaks.

export type LookupNotifyPayload = {
  query: string;
  status: "success" | "not_found" | "error";
  ip: string;
  userAgent?: string | null;
  referer?: string | null;
  origin?: string | null;
  country?: string | null;
  city?: string | null;
  mobileNumber?: string | null;
  responseTimeSeconds?: number | null;
  errorMessage?: string | null;
};

export function notifyDiscord(request: Request, payload: LookupNotifyPayload): void {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const h = request.headers;
  const country =
    payload.country ||
    h.get("cf-ipcountry") ||
    h.get("x-vercel-ip-country") ||
    null;
  const city = payload.city || h.get("x-vercel-ip-city") || null;

  const color =
    payload.status === "success"
      ? 0x22d3ee
      : payload.status === "not_found"
        ? 0xf59e0b
        : 0xef4444;

  const fields = [
    { name: "Vehicle #", value: "`" + payload.query + "`", inline: true },
    { name: "Status", value: payload.status, inline: true },
    { name: "IP", value: "`" + payload.ip + "`", inline: true },
    {
      name: "Location",
      value: [city, country].filter(Boolean).join(", ") || "unknown",
      inline: true,
    },
    {
      name: "Response time",
      value:
        typeof payload.responseTimeSeconds === "number"
          ? payload.responseTimeSeconds.toFixed(2) + "s"
          : "—",
      inline: true,
    },
    {
      name: "Mobile found",
      value: payload.mobileNumber ? "`" + payload.mobileNumber + "`" : "—",
      inline: true,
    },
    {
      name: "Referer",
      value: (payload.referer || h.get("referer") || "—").slice(0, 500),
      inline: false,
    },
    {
      name: "Origin",
      value: payload.origin || h.get("origin") || "—",
      inline: false,
    },
    {
      name: "User agent",
      value: ("`" + (payload.userAgent || h.get("user-agent") || "—") + "`").slice(0, 1000),
      inline: false,
    },
  ];

  if (payload.errorMessage) {
    fields.push({ name: "Error", value: payload.errorMessage.slice(0, 500), inline: false });
  }

  const body = JSON.stringify({
    username: "VahanX Lookup",
    embeds: [
      {
        title: "🔎 Vehicle lookup",
        color,
        timestamp: new Date().toISOString(),
        fields,
      },
    ],
  });

  // Fire-and-forget; don't block the response, don't throw.
  try {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
