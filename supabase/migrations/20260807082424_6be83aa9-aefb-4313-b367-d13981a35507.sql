CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cached jsonb;
  _at timestamptz;
  _r jsonb;
BEGIN
  SELECT payload, computed_at INTO _cached, _at
  FROM public.stats_cache WHERE key = 'platform_stats';

  IF _cached IS NOT NULL AND _at > now() - interval '60 seconds' THEN
    RETURN _cached || jsonb_build_object('cached', true, 'computed_at', _at);
  END IF;

  SELECT jsonb_build_object(
    'active_parts', (SELECT count(*) FROM parts WHERE status='approved' AND COALESCE(is_sold,false)=false),
    'total_parts', (SELECT count(*) FROM parts WHERE status='approved'),
    'brand_count', (SELECT count(DISTINCT NULLIF(btrim(brand),'')) FROM parts WHERE status='approved'),
    'model_count', (SELECT count(DISTINCT NULLIF(btrim(model),'')) FROM parts WHERE status='approved'),
    'total_oem', (SELECT count(DISTINCT NULLIF(btrim(oem_code),'')) FROM parts WHERE status='approved'),
    'verified_sellers', (SELECT count(*) FROM profiles WHERE COALESCE(is_verified,false)=true),
    'total_sellers', (SELECT count(DISTINCT seller_id) FROM parts WHERE status='approved'),
    'total_members', (SELECT count(*) FROM profiles),
    'total_cities', (SELECT count(DISTINCT public.tr_normalize_city(city)) FROM parts WHERE status='approved' AND public.tr_normalize_city(city) IS NOT NULL),
    'today_new', (SELECT count(*) FROM parts WHERE status='approved' AND (created_at AT TIME ZONE 'Europe/Istanbul')::date = (now() AT TIME ZONE 'Europe/Istanbul')::date),
    'last24h_new', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '24 hours'),
    'week_count', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '7 days'),
    'last24h_views', (SELECT count(*) FROM part_views WHERE created_at >= now() - interval '24 hours'),
    'completed_sales', (SELECT count(*) FROM parts WHERE COALESCE(is_sold,false)=true),
    'open_part_requests', (SELECT count(*) FROM part_requests WHERE COALESCE(is_active,true)=true AND deleted_at IS NULL),
    'total_stock_value', COALESCE((
      SELECT sum(COALESCE(price,0) * GREATEST(COALESCE(stock_quantity,1),1))
      FROM parts WHERE status='approved' AND COALESCE(is_sold,false)=false AND price IS NOT NULL AND price > 0
    ), 0)
  ) INTO _r;

  INSERT INTO public.stats_cache(key, payload, computed_at)
  VALUES ('platform_stats', _r, now())
  ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;

  RETURN _r || jsonb_build_object('cached', false, 'computed_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.home_activity_feed(_limit int DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'at')::timestamptz DESC), '[]'::jsonb)
  FROM (
    (
      SELECT jsonb_build_object('kind','part','label', COALESCE(NULLIF(btrim(p.title),''),'Yeni ürün'), 'at', p.created_at) AS x
      FROM parts p
      WHERE p.status='approved' AND p.created_at >= now() - interval '14 days'
      ORDER BY p.created_at DESC
      LIMIT GREATEST(COALESCE(_limit,8),1)
    )
    UNION ALL
    (
      SELECT jsonb_build_object('kind','seller','label','Yeni satıcı kayıt oldu','at', pr.created_at) AS x
      FROM profiles pr
      WHERE pr.created_at >= now() - interval '14 days'
      ORDER BY pr.created_at DESC
      LIMIT GREATEST(COALESCE(_limit,8),1)
    )
    UNION ALL
    (
      SELECT jsonb_build_object('kind','request','label', COALESCE(NULLIF(btrim(r.part_name),''),'Yeni parça') || ' talebi oluşturuldu', 'at', r.created_at) AS x
      FROM part_requests r
      WHERE COALESCE(r.is_active,true)=true AND r.deleted_at IS NULL AND r.created_at >= now() - interval '14 days'
      ORDER BY r.created_at DESC
      LIMIT GREATEST(COALESCE(_limit,8),1)
    )
  ) s
$$;

REVOKE ALL ON FUNCTION public.home_activity_feed(int) FROM public;
GRANT EXECUTE ON FUNCTION public.home_activity_feed(int) TO anon, authenticated, service_role;