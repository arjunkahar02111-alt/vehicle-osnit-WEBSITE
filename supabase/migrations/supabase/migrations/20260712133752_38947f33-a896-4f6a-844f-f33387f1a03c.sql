GRANT ALL ON public.admin_settings TO service_role;
GRANT ALL ON public.blocked_ips TO service_role;
GRANT ALL ON public.lookup_logs TO service_role;
NOTIFY pgrst, 'reload schema';
