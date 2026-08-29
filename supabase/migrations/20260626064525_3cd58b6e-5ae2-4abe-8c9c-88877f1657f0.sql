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
  WITH with_photos AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at,
           row_number() OVER (ORDER BY md5(p.id::text || _seed)) AS rn
    FROM public.parts p
    WHERE p.status = 'approved'
      AND p.vehicle_class = _vehicle_class
      AND p.has_photos = true
  ),
  without_photos AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at,
           row_number() OVER (ORDER BY md5(p.id::text || _seed)) AS rn
    FROM public.parts p
    WHERE p.status = 'approved'
      AND p.vehicle_class = _vehicle_class
      AND p.has_photos = false
  ),
  combined AS (
    SELECT w.id, w.title, w.brand, w.model, w.year, w.price, w.city, w.photos,
           w.condition, w.category, w.stock_quantity, w.oem_code, w.seller_id,
           w.part_type, w.created_at,
           (w.rn::numeric * 10.0 / 7.0) AS sort_key, w.rn
    FROM with_photos w
    UNION ALL
    SELECT n.id, n.title, n.brand, n.model, n.year, n.price, n.city, n.photos,
           n.condition, n.category, n.stock_quantity, n.oem_code, n.seller_id,
           n.part_type, n.created_at,
           (n.rn::numeric * 10.0 / 3.0 + 0.5) AS sort_key, n.rn
    FROM without_photos n
  )
  SELECT id, title, brand, model, year, price, city, photos, condition, category,
         stock_quantity, oem_code, seller_id, part_type, created_at
  FROM combined
  ORDER BY sort_key, rn
  OFFSET _offset
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.home_feed_mix(text, text, int, int) TO anon, authenticated, service_role;