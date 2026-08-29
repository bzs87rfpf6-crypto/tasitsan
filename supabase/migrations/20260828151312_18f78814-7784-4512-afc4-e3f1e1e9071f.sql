
-- 1) analytics_events: anonim ziyaretçi anahtarı
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS visitor_key text;
CREATE INDEX IF NOT EXISTS analytics_events_visitor_key_idx
  ON public.analytics_events (visitor_key, created_at DESC);

-- 2) Sekme bazlı presence
CREATE TABLE IF NOT EXISTS public.visitor_presence (
  tab_id text PRIMARY KEY,
  visitor_key text NOT NULL,
  session_id text,
  user_id uuid,
  path text,
  city text,
  country text,
  device text,
  user_agent text,
  is_bot boolean NOT NULL DEFAULT false,
  is_internal boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS visitor_presence_last_seen_idx ON public.visitor_presence (last_seen DESC);
CREATE INDEX IF NOT EXISTS visitor_presence_visitor_idx ON public.visitor_presence (visitor_key, last_seen DESC);

GRANT ALL ON public.visitor_presence TO service_role;
ALTER TABLE public.visitor_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read visitor presence"
  ON public.visitor_presence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Gün bazlı benzersiz ziyaretçi
CREATE TABLE IF NOT EXISTS public.visitor_days (
  day date NOT NULL,
  visitor_key text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 1,
  is_bot boolean NOT NULL DEFAULT false,
  is_internal boolean NOT NULL DEFAULT false,
  PRIMARY KEY (day, visitor_key)
);
CREATE INDEX IF NOT EXISTS visitor_days_day_idx ON public.visitor_days (day DESC);

GRANT ALL ON public.visitor_days TO service_role;
ALTER TABLE public.visitor_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read visitor days"
  ON public.visitor_days FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Heartbeat kaydı (yalnızca sunucu tarafından, service_role ile çağrılır)
CREATE OR REPLACE FUNCTION public.record_visitor_presence(
  _tab_id text,
  _visitor_key text,
  _session_id text DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _path text DEFAULT NULL,
  _city text DEFAULT NULL,
  _country text DEFAULT NULL,
  _device text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _is_bot boolean DEFAULT false,
  _is_internal boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF COALESCE(_tab_id,'') = '' OR COALESCE(_visitor_key,'') = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.visitor_presence AS vp (
    tab_id, visitor_key, session_id, user_id, path, city, country, device,
    user_agent, is_bot, is_internal, first_seen, last_seen, ended_at
  ) VALUES (
    _tab_id, _visitor_key, _session_id, _user_id, _path, _city, _country, _device,
    _user_agent, COALESCE(_is_bot,false), COALESCE(_is_internal,false), now(), now(), NULL
  )
  ON CONFLICT (tab_id) DO UPDATE SET
    visitor_key = EXCLUDED.visitor_key,
    session_id  = COALESCE(EXCLUDED.session_id, vp.session_id),
    user_id     = COALESCE(EXCLUDED.user_id, vp.user_id),
    path        = COALESCE(EXCLUDED.path, vp.path),
    city        = COALESCE(EXCLUDED.city, vp.city),
    country     = COALESCE(EXCLUDED.country, vp.country),
    device      = COALESCE(EXCLUDED.device, vp.device),
    user_agent  = COALESCE(EXCLUDED.user_agent, vp.user_agent),
    is_bot      = EXCLUDED.is_bot,
    is_internal = EXCLUDED.is_internal,
    last_seen   = now(),
    ended_at    = NULL;

  IF NOT COALESCE(_is_bot,false) AND NOT COALESCE(_is_internal,false) THEN
    INSERT INTO public.visitor_days AS vd (day, visitor_key, first_seen, last_seen, hits, is_bot, is_internal)
    VALUES (_today, _visitor_key, now(), now(), 1, false, false)
    ON CONFLICT (day, visitor_key) DO UPDATE SET
      last_seen = now(),
      hits = vd.hits + 1;
  END IF;

  -- eski kayıtları temizle (7 günden eski)
  DELETE FROM public.visitor_presence WHERE last_seen < now() - interval '7 days';
END;
$$;

REVOKE ALL ON FUNCTION public.record_visitor_presence(text,text,text,uuid,text,text,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_visitor_presence(text,text,text,uuid,text,text,text,text,text,boolean,boolean) TO service_role;

-- 5) Sekme kapandı
CREATE OR REPLACE FUNCTION public.end_visitor_presence(_tab_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.visitor_presence
     SET ended_at = now(), last_seen = LEAST(last_seen, now())
   WHERE tab_id = _tab_id AND ended_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.end_visitor_presence(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_visitor_presence(text) TO service_role;

-- 6) Admin: anlık çevrimiçi ziyaretçiler
CREATE OR REPLACE FUNCTION public.admin_presence_snapshot(_timeout_seconds integer DEFAULT 45)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_admin boolean;
  _cut timestamptz := now() - make_interval(secs => GREATEST(15, COALESCE(_timeout_seconds, 45)));
  _result jsonb;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH live AS (
    SELECT visitor_key,
           MAX(last_seen) AS last_seen,
           MIN(first_seen) AS first_seen,
           COUNT(*) FILTER (WHERE ended_at IS NULL AND last_seen >= _cut) AS open_tabs,
           bool_or(is_bot) AS is_bot,
           bool_or(is_internal) AS is_internal,
           (ARRAY_AGG(path ORDER BY last_seen DESC) FILTER (WHERE path IS NOT NULL))[1] AS path,
           (ARRAY_AGG(city ORDER BY last_seen DESC) FILTER (WHERE city IS NOT NULL))[1] AS city,
           (ARRAY_AGG(country ORDER BY last_seen DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
           (ARRAY_AGG(device ORDER BY last_seen DESC) FILTER (WHERE device IS NOT NULL))[1] AS device,
           (ARRAY_AGG(session_id ORDER BY last_seen DESC) FILTER (WHERE session_id IS NOT NULL))[1] AS session_id
      FROM public.visitor_presence
     WHERE last_seen >= now() - interval '2 hours'
     GROUP BY visitor_key
  ),
  scored AS (
    SELECT *,
           (open_tabs > 0 AND last_seen >= _cut) AS is_online
      FROM live
  )
  SELECT jsonb_build_object(
    'online_visitors', (SELECT COUNT(*) FROM scored WHERE is_online AND NOT is_bot AND NOT is_internal),
    'online_admins',   (SELECT COUNT(*) FROM scored WHERE is_online AND is_internal),
    'online_bots',     (SELECT COUNT(*) FROM scored WHERE is_online AND is_bot),
    'unique_today',    (SELECT COUNT(*) FROM public.visitor_days
                         WHERE day = (now() AT TIME ZONE 'Europe/Istanbul')::date),
    'visitors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'visitor', right(visitor_key, 6),
        'session_id', session_id,
        'online', is_online,
        'open_tabs', open_tabs,
        'path', path,
        'city', city,
        'country', country,
        'device', device,
        'is_bot', is_bot,
        'is_internal', is_internal,
        'first_seen', first_seen,
        'last_seen', last_seen,
        'seconds_since', EXTRACT(EPOCH FROM (now() - last_seen))::int
      ) ORDER BY is_online DESC, last_seen DESC)
      FROM (SELECT * FROM scored ORDER BY is_online DESC, last_seen DESC LIMIT 100) s
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_presence_snapshot(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_presence_snapshot(integer) TO authenticated, service_role;

-- 7) Günlük benzersiz ziyaretçi: artık IP tabanlı anonim anahtar
CREATE OR REPLACE FUNCTION public.unique_visitors_today()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    (SELECT COUNT(*)::int FROM public.visitor_days
      WHERE day = (now() AT TIME ZONE 'Europe/Istanbul')::date
        AND NOT is_bot AND NOT is_internal),
    (SELECT COUNT(DISTINCT COALESCE(NULLIF(ae.fingerprint,''), NULLIF(ae.visitor_id,''), ae.session_id))::int
       FROM public.analytics_events_human ae
      WHERE ae.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul')
  );
$$;
