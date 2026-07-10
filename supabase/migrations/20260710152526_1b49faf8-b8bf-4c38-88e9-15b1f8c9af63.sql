
CREATE TABLE public.lookup_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  query text NOT NULL,
  status text NOT NULL,
  ip text NOT NULL,
  country text,
  city text,
  user_agent text,
  referer text,
  mobile_number text,
  response_time_seconds numeric,
  error_message text
);
CREATE INDEX lookup_logs_ts_idx ON public.lookup_logs (ts DESC);
CREATE INDEX lookup_logs_ip_idx ON public.lookup_logs (ip);
CREATE INDEX lookup_logs_status_idx ON public.lookup_logs (status);
GRANT ALL ON public.lookup_logs TO service_role;
ALTER TABLE public.lookup_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.blocked_ips (
  ip text NOT NULL PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.blocked_ips TO service_role;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_settings (
  key text NOT NULL PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_settings TO service_role;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
