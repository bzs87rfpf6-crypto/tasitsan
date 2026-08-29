
-- 1) Yardımcı: kullanıcı yönetici mi?
CREATE OR REPLACE FUNCTION public.is_staff_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user_id IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role IN ('admin','super_admin')
  ) END;
$$;

REVOKE ALL ON FUNCTION public.is_staff_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_user(uuid) TO authenticated, anon, service_role;

-- 2) analytics_events: yönetici oturumlarını otomatik iç kullanım olarak işaretle
CREATE OR REPLACE FUNCTION public._tg_mark_internal_staff_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff_user(COALESCE(NEW.user_id, auth.uid())) THEN
    NEW.is_internal := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_mark_internal_staff_event ON public.analytics_events;
CREATE TRIGGER tg_mark_internal_staff_event
BEFORE INSERT ON public.analytics_events
FOR EACH ROW EXECUTE FUNCTION public._tg_mark_internal_staff_event();

-- 3) presence kaydı: yönetici kullanıcıysa iç kullanım say, geçmiş kayıtları da düzelt
CREATE OR REPLACE FUNCTION public.record_visitor_presence(
  _tab_id text,
  _visitor_key text,
  _session_id text DEFAULT NULL::text,
  _user_id uuid DEFAULT NULL::uuid,
  _path text DEFAULT NULL::text,
  _city text DEFAULT NULL::text,
  _country text DEFAULT NULL::text,
  _device text DEFAULT NULL::text,
  _user_agent text DEFAULT NULL::text,
  _is_bot boolean DEFAULT false,
  _is_internal boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  _internal boolean;
BEGIN
  IF COALESCE(_tab_id,'') = '' OR COALESCE(_visitor_key,'') = '' THEN
    RETURN;
  END IF;

  _internal := COALESCE(_is_internal,false)
            OR public.is_staff_user(COALESCE(_user_id, auth.uid()))
            OR COALESCE(_path,'') LIKE '/admin%';

  INSERT INTO public.visitor_presence AS vp (
    tab_id, visitor_key, session_id, user_id, path, city, country, device,
    user_agent, is_bot, is_internal, first_seen, last_seen, ended_at
  ) VALUES (
    _tab_id, _visitor_key, _session_id, _user_id, _path, _city, _country, _device,
    _user_agent, COALESCE(_is_bot,false), _internal, now(), now(), NULL
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
    is_internal = vp.is_internal OR EXCLUDED.is_internal,
    last_seen   = now(),
    ended_at    = NULL;

  IF _internal THEN
    -- Aynı ziyaretçi anahtarına ait tüm sekmeleri iç kullanım olarak işaretle
    UPDATE public.visitor_presence
       SET is_internal = true
     WHERE visitor_key = _visitor_key AND is_internal = false;
    -- Bugünkü benzersiz ziyaretçi sayımından çıkar
    UPDATE public.visitor_days
       SET is_internal = true
     WHERE visitor_key = _visitor_key AND is_internal = false;
  ELSIF NOT COALESCE(_is_bot,false) THEN
    INSERT INTO public.visitor_days AS vd (day, visitor_key, first_seen, last_seen, hits, is_bot, is_internal)
    VALUES (_today, _visitor_key, now(), now(), 1, false, false)
    ON CONFLICT (day, visitor_key) DO UPDATE SET
      last_seen = now(),
      hits = vd.hits + 1;
  END IF;

  DELETE FROM public.visitor_presence WHERE last_seen < now() - interval '7 days';
END;
$$;

-- 4) Canlı durum listesi: yönetici/geliştirici satırlarını ziyaretçi listesinden çıkar
CREATE OR REPLACE FUNCTION public.admin_presence_snapshot(_timeout_seconds integer DEFAULT 45)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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
           bool_or(is_internal OR public.is_staff_user(user_id)) AS is_internal,
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
    SELECT *, (open_tabs > 0 AND last_seen >= _cut) AS is_online FROM live
  )
  SELECT jsonb_build_object(
    'online_visitors', (SELECT COUNT(*) FROM scored WHERE is_online AND NOT is_bot AND NOT is_internal),
    'online_admins',   (SELECT COUNT(*) FROM scored WHERE is_online AND is_internal),
    'online_bots',     (SELECT COUNT(*) FROM scored WHERE is_online AND is_bot),
    'unique_today',    (SELECT COUNT(*) FROM public.visitor_days
                         WHERE day = (now() AT TIME ZONE 'Europe/Istanbul')::date
                           AND NOT COALESCE(is_bot,false) AND NOT COALESCE(is_internal,false)),
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
      FROM (
        SELECT * FROM scored
         WHERE NOT is_internal
         ORDER BY is_online DESC, last_seen DESC
         LIMIT 100
      ) s
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

-- 5) Geriye dönük düzeltme: yönetici kullanıcı kayıtları
UPDATE public.visitor_presence vp
   SET is_internal = true
 WHERE is_internal = false AND public.is_staff_user(vp.user_id);

UPDATE public.visitor_days vd
   SET is_internal = true
 WHERE is_internal = false
   AND vd.visitor_key IN (
     SELECT DISTINCT visitor_key FROM public.visitor_presence WHERE is_internal = true
   );
