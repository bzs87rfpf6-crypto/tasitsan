
CREATE OR REPLACE FUNCTION public.admin_live_traffic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _now timestamptz := now();
  _online_since timestamptz := _now - interval '5 minutes';
  _stream_since timestamptz := _now - interval '30 minutes';
  _bot_re text;
  _result jsonb;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT NULLIF(string_agg(pattern, '|'), '')
    INTO _bot_re
    FROM public.bot_filter_rules
    WHERE enabled = true;
  IF _bot_re IS NULL THEN
    _bot_re := 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|googlebot|bingbot|embedly|vercelbot|phantom|puppeteer|selenium';
  END IF;

  WITH ev AS (
    SELECT *
    FROM public.analytics_events
    WHERE created_at >= _stream_since
      AND session_id IS NOT NULL
      AND (user_agent IS NULL OR user_agent !~* _bot_re)
  ),
  online_ev AS (
    SELECT * FROM ev WHERE created_at >= _online_since
  ),
  sessions AS (
    SELECT
      session_id,
      MIN(created_at) AS joined_at,
      MAX(created_at) AS last_at,
      (ARRAY_AGG(path ORDER BY created_at DESC) FILTER (WHERE path IS NOT NULL))[1] AS path,
      (ARRAY_AGG(city ORDER BY created_at DESC) FILTER (WHERE city IS NOT NULL))[1] AS city,
      (ARRAY_AGG(country ORDER BY created_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
      (ARRAY_AGG(device ORDER BY created_at DESC) FILTER (WHERE device IS NOT NULL))[1] AS device,
      (ARRAY_AGG(user_agent ORDER BY created_at DESC) FILTER (WHERE user_agent IS NOT NULL))[1] AS user_agent
    FROM online_ev
    GROUP BY session_id
  ),
  sessions_enriched AS (
    SELECT
      session_id,
      joined_at,
      last_at,
      path,
      city,
      country,
      COALESCE(device, 'unknown') AS device,
      CASE
        WHEN user_agent IS NULL THEN 'Bilinmiyor'
        WHEN user_agent ~* 'edg/' THEN 'Edge'
        WHEN user_agent ~* 'chrome/' AND user_agent !~* 'edg/' THEN 'Chrome'
        WHEN user_agent ~* 'firefox/' THEN 'Firefox'
        WHEN user_agent ~* 'safari/' AND user_agent !~* 'chrome/' THEN 'Safari'
        WHEN user_agent ~* 'opera|opr/' THEN 'Opera'
        ELSE 'Diğer'
      END AS browser
    FROM sessions
  ),
  sessions_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'session', right(session_id, 6),
      'path', COALESCE(path, '/'),
      'city', CASE
        WHEN country IS NOT NULL AND country !~* '^(turkey|türkiye|turkiye|tr)$' THEN 'Yurtdışı'
        WHEN city IS NULL OR city = '' THEN 'Bilinmiyor'
        ELSE initcap(lower(city))
      END,
      'device', device,
      'browser', browser,
      'joined_at', joined_at,
      'last_at', last_at
    ) ORDER BY last_at DESC), '[]'::jsonb) AS arr
    FROM sessions_enriched
  ),
  cities AS (
    SELECT
      CASE
        WHEN country IS NOT NULL AND country !~* '^(turkey|türkiye|turkiye|tr)$' THEN 'Yurtdışı'
        WHEN city IS NULL OR city = '' THEN 'Bilinmiyor'
        ELSE initcap(lower(city))
      END AS city,
      COUNT(*) AS cnt
    FROM sessions
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 30
  ),
  cities_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('city', city, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM cities
  ),
  pages AS (
    SELECT
      CASE
        WHEN path IS NULL OR path = '' THEN '/'
        WHEN path ~ '^/parts/'  THEN '/parts/…'
        WHEN path ~ '^/stok/'   THEN '/stok/…'
        WHEN path ~ '^/u/'      THEN '/u/…'
        WHEN path ~ '^/oem/'    THEN '/oem/…'
        WHEN path ~ '^/requests/' THEN '/requests/…'
        ELSE path
      END AS path,
      COUNT(DISTINCT session_id) AS cnt
    FROM online_ev
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 10
  ),
  pages_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('path', path, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS arr
    FROM pages
  ),
  stream AS (
    SELECT
      event_type,
      path,
      city,
      metadata,
      created_at,
      right(session_id, 6) AS session
    FROM ev
    ORDER BY created_at DESC
    LIMIT 40
  ),
  stream_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'event_type', event_type,
      'path', path,
      'city', CASE WHEN city IS NULL OR city = '' THEN NULL ELSE initcap(lower(city)) END,
      'session', session,
      'title', metadata->>'title',
      'query', metadata->>'query',
      'oem',   metadata->>'oem',
      'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb) AS arr
    FROM stream
  )
  SELECT jsonb_build_object(
    'online_count', (SELECT COUNT(*) FROM sessions),
    'sessions', (SELECT arr FROM sessions_json),
    'cities',   (SELECT arr FROM cities_json),
    'pages',    (SELECT arr FROM pages_json),
    'stream',   (SELECT arr FROM stream_json),
    'debug', jsonb_build_object(
      'snapshotAt', _now,
      'onlineSince', _online_since,
      'streamSince', _stream_since,
      'analyticsRowsWindow', (SELECT COUNT(*) FROM ev),
      'distinctSessions5m', (SELECT COUNT(*) FROM sessions)
    )
  )
  INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_live_traffic() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_live_traffic() TO authenticated;
