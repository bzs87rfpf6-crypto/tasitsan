
CREATE OR REPLACE FUNCTION public.admin_conversion_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _now timestamptz := now();
  _d1  timestamptz := now() - interval '1 day';
  _d7  timestamptz := now() - interval '7 days';
  _d30 timestamptz := now() - interval '30 days';
  _today_start timestamptz := date_trunc('day', now());
  _result jsonb;
BEGIN
  SELECT has_role(auth.uid(), 'admin'::app_role) INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
  -- Part view aggregations from analytics_events (richer + has timestamp granularity)
  pv AS (
    SELECT
      (metadata->>'part_id')::uuid AS part_id,
      metadata->>'title' AS title,
      metadata->>'brand' AS brand,
      created_at
    FROM analytics_events
    WHERE event_type = 'part_view'
      AND metadata ? 'part_id'
      AND created_at >= _d30
  ),
  top_24h AS (
    SELECT part_id,
           max(title) AS title,
           max(brand) AS brand,
           count(*)::int AS views
    FROM pv WHERE created_at >= _d1
    GROUP BY part_id ORDER BY views DESC LIMIT 15
  ),
  top_7d AS (
    SELECT part_id, max(title) AS title, max(brand) AS brand, count(*)::int AS views
    FROM pv WHERE created_at >= _d7
    GROUP BY part_id ORDER BY views DESC LIMIT 15
  ),
  top_30d AS (
    SELECT part_id, max(title) AS title, max(brand) AS brand, count(*)::int AS views
    FROM pv
    GROUP BY part_id ORDER BY views DESC LIMIT 15
  ),
  -- OEM searches
  top_oem AS (
    SELECT upper(trim(oem)) AS oem,
           count(*)::int AS search_count,
           max(created_at) AS last_at
    FROM oem_searches
    WHERE created_at >= _d30
    GROUP BY upper(trim(oem))
    ORDER BY search_count DESC
    LIMIT 25
  ),
  no_result AS (
    SELECT upper(trim(oem)) AS oem,
           sum(attempt_count)::int AS attempts,
           max(last_attempt_at) AS last_at,
           max(reason) AS reason
    FROM oem_failed_searches
    WHERE last_attempt_at >= _d30
    GROUP BY upper(trim(oem))
    ORDER BY attempts DESC
    LIMIT 25
  ),
  -- WhatsApp clicks per part
  wa_parts AS (
    SELECT (metadata->>'part_id')::uuid AS part_id,
           count(*)::int AS clicks
    FROM analytics_events
    WHERE event_type = 'click_whatsapp'
      AND metadata ? 'part_id'
      AND created_at >= _d30
    GROUP BY (metadata->>'part_id')::uuid
    ORDER BY clicks DESC
    LIMIT 15
  ),
  wa_top AS (
    SELECT w.part_id, COALESCE(p.title, '—') AS title, p.brand, p.model, w.clicks
    FROM wa_parts w
    LEFT JOIN parts p ON p.id = w.part_id
  ),
  -- Inquiries per part (last 30 days)
  inq_top AS (
    SELECT i.part_id,
           count(*)::int AS inquiries,
           max(p.title) AS title,
           max(p.brand) AS brand
    FROM inquiries i
    LEFT JOIN parts p ON p.id = i.part_id
    WHERE i.created_at >= _d30
    GROUP BY i.part_id
    ORDER BY inquiries DESC
    LIMIT 15
  ),
  -- Favorites top (all-time, with 30d additions)
  fav_top AS (
    SELECT f.part_id,
           count(*)::int AS favorites,
           max(p.title) AS title,
           max(p.brand) AS brand
    FROM favorites f
    LEFT JOIN parts p ON p.id = f.part_id
    GROUP BY f.part_id
    ORDER BY favorites DESC
    LIMIT 15
  ),
  -- Traffic sources from referrer (per session, last 30 days)
  src_sessions AS (
    SELECT DISTINCT ON (session_id)
      session_id,
      lower(COALESCE(referrer, '')) AS ref
    FROM analytics_events
    WHERE created_at >= _d30 AND session_id IS NOT NULL
    ORDER BY session_id, created_at ASC
  ),
  src_cls AS (
    SELECT CASE
      WHEN ref = '' THEN 'Direkt'
      WHEN ref LIKE '%google.%/imghp%' OR ref LIKE '%tbm=isch%' OR ref LIKE '%images.google%' THEN 'Google Görseller'
      WHEN ref LIKE '%search.google.com/search-console%' OR ref LIKE '%searchconsole%' THEN 'Search Console'
      WHEN ref LIKE '%google.%' THEN 'Google'
      WHEN ref LIKE '%bing.%' THEN 'Bing'
      WHEN ref LIKE '%yandex.%' THEN 'Yandex'
      WHEN ref LIKE '%facebook.%' OR ref LIKE '%fb.com%' OR ref LIKE '%lm.facebook%' THEN 'Facebook'
      WHEN ref LIKE '%instagram.%' THEN 'Instagram'
      WHEN ref LIKE '%whatsapp.%' OR ref LIKE '%wa.me%' OR ref LIKE '%api.whatsapp%' THEN 'WhatsApp'
      WHEN ref LIKE '%t.co%' OR ref LIKE '%twitter.%' OR ref LIKE '%x.com%' THEN 'X / Twitter'
      WHEN ref LIKE '%tasitsan%' OR ref LIKE '%parca-borsasi%' THEN 'Direkt'
      ELSE 'Diğer'
    END AS source
    FROM src_sessions
  ),
  src_counts AS (
    SELECT source, count(*)::int AS sessions
    FROM src_cls
    GROUP BY source
    ORDER BY sessions DESC
  ),
  -- Conversion funnel (distinct sessions last 7d)
  funnel AS (
    SELECT
      count(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')        AS visited,
      count(DISTINCT session_id) FILTER (WHERE event_type IN ('search','oem_search')) AS searched,
      count(DISTINCT session_id) FILTER (WHERE event_type = 'part_view')        AS viewed,
      count(DISTINCT session_id) FILTER (WHERE event_type = 'click_whatsapp')   AS whatsapped
    FROM analytics_events
    WHERE created_at >= _d7
  ),
  inq_sessions_7d AS (
    SELECT count(*)::int AS offered FROM inquiries WHERE created_at >= _d7
  ),
  -- Sales potential: high views, low contact in last 7 days
  pot AS (
    SELECT
      pv.part_id,
      max(pv.title) AS title,
      max(pv.brand) AS brand,
      count(*)::int AS views_7d,
      COALESCE((SELECT count(*) FROM analytics_events ae
        WHERE ae.event_type='click_whatsapp'
          AND (ae.metadata->>'part_id')::uuid = pv.part_id
          AND ae.created_at >= _d7), 0)::int AS wa_7d,
      COALESCE((SELECT count(*) FROM inquiries i
        WHERE i.part_id = pv.part_id AND i.created_at >= _d7), 0)::int AS inq_7d
    FROM pv
    WHERE pv.created_at >= _d7
    GROUP BY pv.part_id
    HAVING count(*) >= 5
  ),
  pot_ranked AS (
    SELECT *,
      (views_7d::numeric / GREATEST(1, wa_7d + inq_7d))::numeric(10,2) AS opportunity_score
    FROM pot
    ORDER BY opportunity_score DESC, views_7d DESC
    LIMIT 15
  ),
  -- SEO daily summary
  google_today AS (
    SELECT count(DISTINCT session_id)::int AS visitors
    FROM analytics_events
    WHERE created_at >= _today_start
      AND lower(COALESCE(referrer, '')) LIKE '%google.%'
  ),
  top_paths_today AS (
    SELECT path, count(*)::int AS hits
    FROM analytics_events
    WHERE created_at >= _today_start AND path IS NOT NULL
    GROUP BY path ORDER BY hits DESC LIMIT 10
  ),
  rising_oem AS (
    SELECT upper(trim(oem)) AS oem,
           count(*) FILTER (WHERE created_at >= _d1)::int AS d1,
           count(*) FILTER (WHERE created_at >= _d7 AND created_at < _d1)::int AS prev6
    FROM oem_searches
    WHERE created_at >= _d7
    GROUP BY upper(trim(oem))
    HAVING count(*) FILTER (WHERE created_at >= _d1) > 0
    ORDER BY (count(*) FILTER (WHERE created_at >= _d1))::numeric
           / GREATEST(1, count(*) FILTER (WHERE created_at >= _d7 AND created_at < _d1)) DESC
    LIMIT 10
  ),
  -- Dashboard cards (today)
  today_users AS (
    SELECT count(DISTINCT session_id)::int AS c
    FROM analytics_events
    WHERE created_at >= _today_start
      AND COALESCE(user_agent,'') !~* 'bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless'
  ),
  today_inq AS (SELECT count(*)::int AS c FROM inquiries WHERE created_at >= _today_start),
  today_wa  AS (SELECT count(*)::int AS c FROM analytics_events WHERE event_type='click_whatsapp' AND created_at >= _today_start),
  today_leads AS (
    SELECT count(DISTINCT session_id)::int AS c FROM analytics_events
    WHERE created_at >= _today_start AND event_type IN ('click_whatsapp','click_call')
  )

  SELECT jsonb_build_object(
    'today_cards', jsonb_build_object(
      'real_users', (SELECT c FROM today_users),
      'inquiries',  (SELECT c FROM today_inq),
      'whatsapp',   (SELECT c FROM today_wa),
      'leads',      (SELECT c FROM today_leads)
    ),
    'top_viewed', jsonb_build_object(
      'd1',  COALESCE((SELECT jsonb_agg(to_jsonb(top_24h)) FROM top_24h), '[]'::jsonb),
      'd7',  COALESCE((SELECT jsonb_agg(to_jsonb(top_7d))  FROM top_7d),  '[]'::jsonb),
      'd30', COALESCE((SELECT jsonb_agg(to_jsonb(top_30d)) FROM top_30d), '[]'::jsonb)
    ),
    'top_oem',        COALESCE((SELECT jsonb_agg(to_jsonb(top_oem))   FROM top_oem),   '[]'::jsonb),
    'no_result_oem',  COALESCE((SELECT jsonb_agg(to_jsonb(no_result)) FROM no_result), '[]'::jsonb),
    'whatsapp_parts', COALESCE((SELECT jsonb_agg(to_jsonb(wa_top))    FROM wa_top),    '[]'::jsonb),
    'inquiry_parts',  COALESCE((SELECT jsonb_agg(to_jsonb(inq_top))   FROM inq_top),   '[]'::jsonb),
    'favorite_parts', COALESCE((SELECT jsonb_agg(to_jsonb(fav_top))   FROM fav_top),   '[]'::jsonb),
    'sources',        COALESCE((SELECT jsonb_agg(to_jsonb(src_counts)) FROM src_counts), '[]'::jsonb),
    'funnel', (
      SELECT jsonb_build_object(
        'visited',    (SELECT visited    FROM funnel),
        'searched',   (SELECT searched   FROM funnel),
        'viewed',     (SELECT viewed     FROM funnel),
        'whatsapped', (SELECT whatsapped FROM funnel),
        'offered',    (SELECT offered    FROM inq_sessions_7d),
        'sold',       0
      )
    ),
    'sales_potential', COALESCE((SELECT jsonb_agg(to_jsonb(pot_ranked)) FROM pot_ranked), '[]'::jsonb),
    'seo_daily', jsonb_build_object(
      'google_visitors_today', (SELECT visitors FROM google_today),
      'top_paths_today',       COALESCE((SELECT jsonb_agg(to_jsonb(top_paths_today)) FROM top_paths_today), '[]'::jsonb),
      'rising_oem',            COALESCE((SELECT jsonb_agg(to_jsonb(rising_oem))      FROM rising_oem),      '[]'::jsonb)
    ),
    'snapshot_at', _now
  )
  INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_conversion_analytics() TO authenticated;
