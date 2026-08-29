
-- Rewrite home_feed_mix: photos-only, random per-session, brand+seller diversity.
CREATE OR REPLACE FUNCTION public.home_feed_mix(
  _vehicle_class text,
  _seed text,
  _limit int DEFAULT 60,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  title text,
  brand text,
  model text,
  year int,
  price numeric,
  city text,
  photos text[],
  condition text,
  category text,
  stock_quantity int,
  oem_code text,
  seller_id uuid,
  part_type text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at,
           md5(p.id::text || _seed) AS h
    FROM public.parts p
    WHERE p.status = 'approved'
      AND p.vehicle_class = _vehicle_class
      AND p.has_photos = true
      AND p.photos IS NOT NULL
      AND array_length(p.photos, 1) > 0
  ),
  ranked AS (
    SELECT b.*,
           row_number() OVER (PARTITION BY coalesce(b.brand,'')      ORDER BY b.h) AS brand_rn,
           row_number() OVER (PARTITION BY coalesce(b.seller_id::text,'') ORDER BY b.h) AS seller_rn
    FROM base b
  )
  SELECT id, title, brand, model, year, price, city, photos, condition, category,
         stock_quantity, oem_code, seller_id, part_type, created_at
  FROM ranked
  -- Interleave: cycle through brands & sellers before repeating any → diverse feed
  ORDER BY (brand_rn + seller_rn), brand_rn, seller_rn, h
  OFFSET _offset
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.home_feed_mix(text, text, int, int) TO anon, authenticated, service_role;


-- Update home_showcase: recent carousels only show parts with photos.
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
      AND has_photos = true
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT 12
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _recent_7d FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved'
      AND created_at >= now() - interval '7 days'
      AND has_photos = true
      AND (_vc IS NULL OR vehicle_class = _vc)
    ORDER BY created_at DESC
    LIMIT 24
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _latest FROM (
    SELECT id,title,brand,model,year,price,city,photos,condition,category,stock_quantity,oem_code,seller_id,part_type,created_at
    FROM parts
    WHERE status='approved'
      AND has_photos = true
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
