CREATE INDEX IF NOT EXISTS idx_analytics_events_session_created
  ON public.analytics_events (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_part_id
  ON public.analytics_events (((metadata->>'part_id')), created_at DESC)
  WHERE metadata ? 'part_id';

CREATE OR REPLACE FUNCTION public.admin_today_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean;
  _day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul';
  _r jsonb;
BEGIN
  SELECT has_role(auth.uid(), 'admin'::app_role) INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH t AS (
    SELECT
      COALESCE(NULLIF(fingerprint,''), NULLIF(visitor_id,''), session_id) AS vkey,
      session_id, event_type, created_at
    FROM public.analytics_events_human
    WHERE created_at >= _day_start
  )
  SELECT jsonb_build_object(
    'day_start', _day_start,
    'snapshot_at', now(),
    'unique_visitors_today', (SELECT count(DISTINCT vkey)::int FROM t),
    'sessions_today',        (SELECT count(DISTINCT session_id)::int FROM t),
    'active_5m',             (SELECT count(DISTINCT vkey)::int FROM t WHERE created_at >= now() - interval '5 minutes'),
    'active_30m',            (SELECT count(DISTINCT vkey)::int FROM t WHERE created_at >= now() - interval '30 minutes'),
    'searches_today',        (SELECT count(*)::int FROM t WHERE event_type IN ('search','oem_search','ai_assistant_search')),
    'part_views_today',      (SELECT count(*)::int FROM t WHERE event_type = 'part_view'),
    'whatsapp_today',        (SELECT count(*)::int FROM t WHERE event_type = 'click_whatsapp'),
    'calls_today',           (SELECT count(*)::int FROM t WHERE event_type = 'click_call'),
    'conversions_today',     (SELECT count(DISTINCT vkey)::int FROM t WHERE event_type IN ('click_whatsapp','click_call')),
    'inquiries_today',       (SELECT count(*)::int FROM public.inquiries WHERE created_at >= _day_start),
    'bots_filtered',         public.filtered_bots_today()
  ) INTO _r;

  RETURN _r;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_today_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_today_metrics() TO authenticated;