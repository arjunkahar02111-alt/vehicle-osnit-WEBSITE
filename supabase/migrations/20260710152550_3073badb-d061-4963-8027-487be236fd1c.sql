
CREATE POLICY "no client access" ON public.lookup_logs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client access" ON public.blocked_ips FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no client access" ON public.admin_settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
