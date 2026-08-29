CREATE OR REPLACE VIEW public.analytics_events_human
WITH (security_invoker = true) AS
SELECT e.id, e.event_type, e.session_id, e.user_id, e.path, e.referrer, e.city, e.country,
       e.device, e.user_agent, e.metadata, e.created_at, e.visitor_id, e.fingerprint,
       e.duration_ms, e.engagement, e.is_bot, e.is_internal
FROM public.analytics_events e
WHERE COALESCE(e.is_bot, false) = false
  AND COALESCE(e.is_internal, false) = false
  AND (e.user_agent IS NULL OR e.user_agent !~* (SELECT public.bot_ua_pattern()))
  AND COALESCE(NULLIF(e.session_id,''), NULLIF(e.visitor_id,''), NULLIF(e.fingerprint,'')) IS NOT NULL
  AND COALESCE(e.path,'') NOT LIKE '/api/%'
  AND COALESCE(e.path,'') NOT LIKE '/admin%'
  AND (e.user_id IS NULL OR e.user_id NOT IN (
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role::text IN ('admin','super_admin')));

CREATE OR REPLACE VIEW public.analytics_events_bot
WITH (security_invoker = true) AS
SELECT e.id, e.event_type, e.session_id, e.user_id, e.path, e.referrer, e.city, e.country,
       e.device, e.user_agent, e.metadata, e.created_at, e.visitor_id, e.fingerprint,
       e.duration_ms, e.engagement, e.is_bot
FROM public.analytics_events e
WHERE COALESCE(e.is_bot, false) = true
   OR (e.user_agent IS NOT NULL AND e.user_agent ~* (SELECT public.bot_ua_pattern()));