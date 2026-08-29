-- Extend home_showcase RPC with optional vehicle_class filter so the home page
-- stats and "newly added" carousels reflect only the selected vehicle class.
CREATE OR REPLACE FUNCTION public.home_showcase(_vehicle_class text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stats jsonb;
  _recent_24h jsonb;
  _recent_7d jsonb;
  _latest jsonb;
  _vc text := NULLIF(_vehicle_class, '');
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

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _recent_24h FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved'
      AND created_at >= now() - interval '24 hours'
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT 12
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _recent_7d FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved'
      AND created_at >= now() - interval '7 days'
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT 24
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _latest FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved'
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT 24
  ) t;

  RETURN jsonb_build_object(
    'stats', _stats,
    'recent_24h', _recent_24h,
    'recent_7d', _recent_7d,
    'latest', _latest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.home_showcase(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_showcase(text) TO anon, authenticated, service_role;
-- Drop the old no-arg signature so PostgREST doesn't get confused.
DROP FUNCTION IF EXISTS public.home_showcase();
