import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Car, Phone, Hash, AlertTriangle, Sparkles, Zap, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type VehicleResult = {
  success: boolean;
  vehicle_number?: string;
  mobile_number?: string;
  response_time_seconds?: number;
  error?: string;
  raw?: unknown;
};

async function lookupVehicle(query: string): Promise<VehicleResult> {
  // 1. Obtain a short-lived, single-use signed token bound to our origin
  const tokRes = await fetch("/api/token", { credentials: "same-origin" });
  if (!tokRes.ok) {
    return { success: false, error: "Unable to establish session. Please retry." };
  }
  const { token } = (await tokRes.json()) as { token: string };

  // Small delay: the server rejects tokens under 250ms old (anti-bot)
  await new Promise((r) => setTimeout(r, 350));

  // 2. Call the guarded lookup endpoint
  const res = await fetch(`/api/vehicle?query=${encodeURIComponent(query)}`, {
    headers: { "x-vx-token": token },
    credentials: "same-origin",
  });
  const data = await res.json();
  if (res.ok && data?.success) {
    return {
      success: true,
      vehicle_number: data.vehicle_number,
      mobile_number: data.mobile_number,
      response_time_seconds: data.response_time_seconds,
    };
  }
  return {
    success: false,
    error: data?.error || (res.status === 429 ? "Too many requests" : "No data found"),
    vehicle_number: data?.vehicle_number,
  };
}

function Index() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VehicleResult | null>(null);

  const normalized = useMemo(() => value.toUpperCase().replace(/\s+/g, ""), [value]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalized || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await lookupVehicle(normalized);
      setResult(r);
    } catch (err) {
      setResult({ success: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050914] text-white">
      <BackgroundFX />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8 sm:py-12">
        {/* Nav */}
        <header className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 shadow-lg shadow-fuchsia-500/30">
              <Car className="h-5 w-5 text-black" />
            </div>
            <span className="text-lg font-black tracking-tight">
              Vahan<span className="text-cyan-400">X</span>
            </span>
          </motion.div>
          <motion.a
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            href="#features"
            className="hidden text-sm text-white/60 hover:text-white sm:block"
          >
            How it works
          </motion.a>
        </header>

        {/* Hero */}
        <main className="mt-10 grid flex-1 items-center gap-12 sm:mt-16 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              Real-time RTO intel
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
            >
              Decode any{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-fuchsia-400 bg-clip-text text-transparent">
                vehicle
              </span>
              <br />
              in a heartbeat.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="mt-5 max-w-lg text-base text-white/60 sm:text-lg"
            >
              Type an Indian vehicle number. We&apos;ll fetch the owner intel from
              the RTO grid — buttery smooth, always live.
            </motion.p>

            {/* Form */}
            <motion.form
              onSubmit={onSubmit}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="mt-8"
            >
              <div className="group relative">
                <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-fuchsia-500 opacity-60 blur-md transition group-focus-within:opacity-100" />
                <div className="relative flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0a1024]/90 p-2 backdrop-blur">
                  <div className="pl-3 text-white/40">
                    <Search className="h-5 w-5" />
                  </div>
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. MH12DE1433"
                    spellCheck={false}
                    autoCapitalize="characters"
                    className="w-full min-w-0 bg-transparent px-1 py-3 text-base font-mono uppercase tracking-widest text-white placeholder:text-white/30 focus:outline-none sm:text-lg"
                  />
                  <button
                    type="submit"
                    disabled={loading || !normalized}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-3 text-sm font-bold text-black shadow-lg shadow-fuchsia-500/25 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 sm:px-5"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">{loading ? "Scanning" : "Lookup"}</span>
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["MH12DE1433", "HR26DK8337", "KA05MG1234"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setValue(s)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.form>

            {/* Result */}
            <AnimatePresence mode="wait">
              {loading && <ScanningState key="scan" />}
              {!loading && result && (
                <ResultCard key={result.vehicle_number || "r"} result={result} />
              )}
            </AnimatePresence>
          </div>

          {/* Right visual */}
          <div className="relative hidden lg:block">
            <CarVisual plate={normalized || "VAHAN·X"} scanning={loading} />
          </div>
        </main>

        {/* Mobile car visual */}
        <div className="mt-10 lg:hidden">
          <CarVisual plate={normalized || "VAHAN·X"} scanning={loading} compact />
        </div>

        {/* Features */}
        <section id="features" className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Zap, title: "Sub-second", desc: "Ultra-fast RTO lookups powered by the live grid." },
            { icon: ShieldCheck, title: "Secure proxy", desc: "Requests routed through our edge — your keys stay private." },
            { icon: Sparkles, title: "Delightful UI", desc: "Silky animations on any device, big or small." },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <f.icon className="h-5 w-5 text-cyan-300" />
              <h3 className="mt-3 font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-white/60">{f.desc}</p>
            </motion.div>
          ))}
        </section>

        <footer className="mt-16 pb-4 text-center text-xs text-white/40">
          Built with ❤ · Developer{" "}
          <a
            href="https://www.arjunkaharofficial.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 underline-offset-4 hover:text-white hover:underline"
          >
            Arjun Kahar
          </a>
        </footer>
      </div>
    </div>
  );
}

function BackgroundFX() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(34,211,238,0.35), transparent 40%), radial-gradient(circle at 85% 80%, rgba(232,121,249,0.28), transparent 45%), radial-gradient(circle at 60% 40%, rgba(59,130,246,0.18), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />
      {/* Moving orbs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl"
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl"
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

function CarVisual({ plate, scanning, compact = false }: { plate: string; scanning: boolean; compact?: boolean }) {
  return (
    <div className={`relative mx-auto ${compact ? "max-w-md" : ""}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="relative aspect-[4/3] w-full"
      >
        {/* Glow platform */}
        <div className="absolute inset-x-8 bottom-6 h-6 rounded-full bg-cyan-400/30 blur-2xl" />

        {/* Car SVG */}
        <motion.svg
          viewBox="0 0 400 260"
          className="relative h-full w-full drop-shadow-[0_20px_40px_rgba(34,211,238,0.25)]"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <defs>
            <linearGradient id="body" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
            <linearGradient id="window" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.9" />
              <stop offset="1" stopColor="#020617" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* Body */}
          <path
            d="M40 170 Q60 120 130 110 L180 70 Q210 55 260 70 L310 110 Q360 120 370 160 L370 190 Q370 200 358 200 L42 200 Q30 200 30 190 Z"
            fill="url(#body)"
          />
          {/* Window */}
          <path
            d="M140 118 L190 82 Q212 72 250 82 L295 118 Z"
            fill="url(#window)"
            opacity="0.95"
          />
          {/* Door line */}
          <path d="M200 118 L200 195" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
          {/* Headlight */}
          <circle cx="345" cy="150" r="8" fill="#fff9c4" />
          <circle cx="345" cy="150" r="14" fill="#fff9c4" opacity="0.25" />
          {/* Tail */}
          <rect x="42" y="145" width="14" height="10" rx="3" fill="#ef4444" />

          {/* Wheels */}
          {[110, 300].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy={205} r={26} fill="#0b1220" stroke="#1f2937" strokeWidth="2" />
              <motion.g
                style={{ originX: `${cx}px`, originY: "205px" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              >
                <circle cx={cx} cy={205} r={14} fill="#334155" />
                <rect x={cx - 1} y={191} width="2" height="28" fill="#94a3b8" />
                <rect x={cx - 14} y={204} width="28" height="2" fill="#94a3b8" />
              </motion.g>
            </g>
          ))}

          {/* Number plate */}
          <rect x="150" y="155" width="100" height="26" rx="4" fill="#fde047" />
          <text
            x="200"
            y="173"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontWeight="800"
            fontSize="14"
            fill="#111827"
          >
            {plate.slice(0, 12)}
          </text>
        </motion.svg>

        {/* Road */}
        <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden">
          <motion.div
            className="h-full w-[200%]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 20px, transparent 20px 40px)",
            }}
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
        </div>

        {/* Scan beam */}
        <AnimatePresence>
          {scanning && (
            <motion.div
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 overflow-hidden rounded-3xl"
            >
              <motion.div
                className="absolute inset-x-0 h-16 bg-gradient-to-b from-cyan-400/0 via-cyan-400/60 to-cyan-400/0 blur-sm"
                initial={{ top: "-10%" }}
                animate={{ top: "110%" }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ScanningState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="mt-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        <span className="text-sm text-white/70">Pinging RTO grid…</span>
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-3 rounded-md bg-white/5"
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
            style={{ width: `${90 - i * 15}%` }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function ResultCard({ result }: { result: VehicleResult }) {
  if (!result.success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="mt-8 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div className="min-w-0">
          <div className="font-semibold text-red-200">Lookup failed</div>
          <div className="mt-1 text-sm text-white/60">{result.error}</div>
          {result.vehicle_number && (
            <div className="mt-2 font-mono text-xs text-white/40">{result.vehicle_number}</div>
          )}
        </div>
      </motion.div>
    );
  }

  const rows: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: Hash, label: "Registration", value: result.vehicle_number || "—" },
    { icon: Phone, label: "Mobile", value: result.mobile_number || "Not on record" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 220 }}
      className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-300">
          <motion.span
            className="inline-block h-2 w-2 rounded-full bg-cyan-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          Match found
        </div>
        {typeof result.response_time_seconds === "number" && (
          <div className="text-xs text-white/40">{result.response_time_seconds.toFixed(2)}s</div>
        )}
      </div>

      {/* Number plate */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260 }}
        className="mt-4 flex items-center justify-center rounded-xl border-2 border-yellow-500/60 bg-yellow-300 px-4 py-3 shadow-inner"
      >
        <span className="font-mono text-2xl font-black tracking-[0.2em] text-black sm:text-3xl">
          {result.vehicle_number}
        </span>
      </motion.div>

      <div className="mt-5 divide-y divide-white/5">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3"
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-cyan-300">
              <r.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-white/40">{r.label}</div>
              <div className="truncate font-mono text-sm text-white sm:text-base">{r.value}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
