CREATE OR REPLACE FUNCTION public.home_showcase(
  _vehicle_class text DEFAULT NULL::text,
  _seed text DEFAULT NULL::text,
  _limit integer DEFAULT 36
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _stats jsonb;
  _recent_24h jsonb;
  _recent_7d jsonb;
  _latest jsonb;
  _vc text := NULLIF(_vehicle_class, '');
  _sd text := coalesce(NULLIF(_seed, ''), to_char(now(), 'YYYYMMDDHH24MISSMS'));
  _lim integer := least(greatest(coalesce(_limit, 36), 12), 48);
  _pool integer := greatest(_lim * 5, 120);
BEGIN
  IF _vc IS NOT NULL AND _vc NOT IN ('automobile','heavy_vehicle','construction','agriculture') THEN
    _vc := NULL;
  END IF;

  SELECT jsonb_build_object(
    'total_parts', (SELECT count(*) FROM parts WHERE status='approved' AND (_vc IS NULL OR vehicle_class = _vc)),
    'total_oem', (SELECT count(DISTINCT oem_code) FROM parts WHERE status='approved' AND oem_code IS NOT NULL AND oem_code <> '' AND (_vc IS NULL OR vehicle_class = _vc)),
    'today_count', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '24 hours' AND (_vc IS NULL OR vehicle_class = _vc)),
    'week_count', (SELECT count(*) FROM parts WHERE status='approved' AND created_at >= now() - interval '7 days' AND (_vc IS NULL OR vehicle_class = _vc)),
    'total_sellers', (SELECT count(DISTINCT seller_id) FROM parts WHERE status='approved' AND (_vc IS NULL OR vehicle_class = _vc)),
    'total_cities', (SELECT count(DISTINCT city) FROM parts WHERE status='approved' AND city IS NOT NULL AND city <> '' AND (_vc IS NULL OR vehicle_class = _vc))
  ) INTO _stats;

  WITH base AS (
    SELECT id,seo_slug,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,oem_codes,seller_id,part_type,is_sold,delivery_options,urgent_delivery,created_at
    FROM parts
    WHERE status='approved'
      AND has_photos = true
      AND coalesce(is_sold, false) = false
      AND coalesce(stock_quantity, 1) > 0
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT _pool
  ),
  d1 AS (
    SELECT * FROM base WHERE created_at >= now() - interval '24 hours'
    ORDER BY md5(_sd || id::text) LIMIT _lim
  ),
  d7 AS (
    SELECT * FROM base WHERE created_at >= now() - interval '7 days'
    ORDER BY md5(_sd || id::text) LIMIT _lim
  ),
  d7_full AS (
    SELECT * FROM d7
    UNION ALL
    SELECT * FROM (
      SELECT * FROM base WHERE id NOT IN (SELECT id FROM d7)
      ORDER BY md5(_sd || id::text)
      LIMIT greatest(_lim - (SELECT count(*) FROM d7), 0)
    ) f
  ),
  lt AS (
    SELECT * FROM base ORDER BY md5(_sd || id::text) LIMIT _lim
  )
  SELECT
    (SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM d1 t),
    (SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM d7_full t),
    (SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM lt t)
  INTO _recent_24h, _recent_7d, _latest;

  RETURN jsonb_build_object(
    'stats', _stats,
    'recent_24h', _recent_24h,
    'recent_7d', _recent_7d,
    'latest', _latest
  );
END;
$function$;