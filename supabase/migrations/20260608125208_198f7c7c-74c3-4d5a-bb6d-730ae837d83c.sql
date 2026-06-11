
CREATE OR REPLACE FUNCTION public.admin_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_members      bigint;
  v_verified_sellers   bigint;
  v_active_sellers     bigint;
  v_total_parts        bigint;
  v_parts_today        bigint;
  v_new_members_30d    bigint;
  v_active_firms       jsonb;
  v_viewed_firms       jsonb;
  v_top_oem            jsonb;
  v_top_searches       jsonb;
  v_today_views        bigint;
  v_today_whatsapp     bigint;
  v_today_calls        bigint;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_total_members FROM public.profiles;
  SELECT count(*) INTO v_verified_sellers FROM public.profiles WHERE is_verified = true;
  SELECT count(DISTINCT seller_id) INTO v_active_sellers FROM public.parts;
  SELECT count(*) INTO v_total_parts FROM public.parts;
  SELECT count(*) INTO v_parts_today FROM public.parts WHERE created_at >= date_trunc('day', now());
  SELECT count(*) INTO v_new_members_30d FROM public.profiles WHERE created_at >= now() - interval '30 days';

  -- En aktif 20 firma (en çok ürün yükleyen)
  WITH top AS (
    SELECT p.seller_id,
           count(*) FILTER (WHERE p.status='approved') AS active_parts,
           count(*) FILTER (WHERE p.status='pending')  AS pending_parts,
           count(*) AS total_parts
      FROM public.parts p
     GROUP BY p.seller_id
     ORDER BY total_parts DESC
     LIMIT 20
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'seller_id', t.seller_id,
    'display_name', coalesce(pr.display_name, '—'),
    'city', pr.city,
    'is_verified', coalesce(pr.is_verified, false),
    'active_parts', t.active_parts,
    'pending_parts', t.pending_parts,
    'total_parts', t.total_parts
  ) ORDER BY t.total_parts DESC), '[]'::jsonb)
  INTO v_active_firms
  FROM top t LEFT JOIN public.profiles pr ON pr.id = t.seller_id;

  -- En çok profil görüntülenen 20 firma (son 30 gün)
  WITH views AS (
    SELECT (e.metadata->>'seller_id')::uuid AS seller_id,
           count(*)::bigint AS views_30d
      FROM public.analytics_events e
     WHERE e.event_type = 'profile_view'
       AND e.created_at >= now() - interval '30 days'
       AND (e.metadata->>'seller_id') IS NOT NULL
     GROUP BY 1
     ORDER BY views_30d DESC
     LIMIT 20
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'seller_id', v.seller_id,
    'display_name', coalesce(pr.display_name, '—'),
    'city', pr.city,
    'is_verified', coalesce(pr.is_verified, false),
    'views_30d', v.views_30d
  ) ORDER BY v.views_30d DESC), '[]'::jsonb)
  INTO v_viewed_firms
  FROM views v LEFT JOIN public.profiles pr ON pr.id = v.seller_id;

  -- En çok aranan OEM (son 30 gün)
  WITH t AS (
    SELECT upper(trim(s.oem)) AS oem, count(*)::bigint AS search_count
      FROM public.oem_searches s
     WHERE s.created_at >= now() - interval '30 days'
     GROUP BY 1
     ORDER BY search_count DESC
     LIMIT 15
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'oem', oem,
    'search_count', search_count,
    'listing_count', (SELECT count(*) FROM public.parts p
                       WHERE p.status='approved' AND t.oem = ANY(p.oem_codes))
  ) ORDER BY search_count DESC), '[]'::jsonb)
  INTO v_top_oem FROM t;

  -- En çok aranan ürün isimleri (son 30 gün)
  WITH q AS (
    SELECT lower(s.query) AS query, count(*)::bigint AS search_count
      FROM public.search_logs s
     WHERE s.query IS NOT NULL AND s.created_at >= now() - interval '30 days'
     GROUP BY 1
     ORDER BY search_count DESC
     LIMIT 15
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('query', query, 'search_count', search_count)
         ORDER BY search_count DESC), '[]'::jsonb)
  INTO v_top_searches FROM q;

  SELECT count(*) INTO v_today_views
    FROM public.analytics_events
   WHERE event_type IN ('part_view','profile_view')
     AND created_at >= date_trunc('day', now());

  SELECT count(*) INTO v_today_whatsapp
    FROM public.analytics_events
   WHERE event_type = 'click_whatsapp'
     AND created_at >= date_trunc('day', now());

  SELECT count(*) INTO v_today_calls
    FROM public.analytics_events
   WHERE event_type = 'click_call'
     AND created_at >= date_trunc('day', now());

  RETURN jsonb_build_object(
    'total_members',     v_total_members,
    'verified_sellers',  v_verified_sellers,
    'active_sellers',    v_active_sellers,
    'total_parts',       v_total_parts,
    'parts_today',       v_parts_today,
    'new_members_30d',   v_new_members_30d,
    'today_views',       v_today_views,
    'today_whatsapp',    v_today_whatsapp,
    'today_calls',       v_today_calls,
    'active_firms',      v_active_firms,
    'viewed_firms',      v_viewed_firms,
    'top_oem',           v_top_oem,
    'top_searches',      v_top_searches
  );
END;
$$;
