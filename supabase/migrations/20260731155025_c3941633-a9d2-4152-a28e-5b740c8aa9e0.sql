CREATE OR REPLACE FUNCTION public.home_feed_random(
  _vehicle_class text,
  _seed text,
  _limit integer DEFAULT 24,
  _offset integer DEFAULT 0,
  _exclude uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE(id uuid, title text, brand text, model text, year integer, price numeric,
  city text, photos text[], condition text, category text, stock_quantity integer,
  oem_code text, seller_id uuid, part_type text, created_at timestamp with time zone,
  seo_slug text, is_sold boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at, p.seo_slug, p.is_sold,
           -- deterministic pseudo-random in [0,1) from (id, seed)
           ('x' || substr(md5(p.id::text || '|' || coalesce(_seed,'')), 1, 8))::bit(32)::bigint
             / 4294967295.0 AS rnd,
           -- recency weight: 1.0 for brand new, decaying to 0 after 30 days
           greatest(0.0, 1.0 - (extract(epoch FROM (now() - p.created_at)) / 2592000.0)) AS recency,
           (p.id = ANY(coalesce(_exclude, '{}'::uuid[]))) AS seen
    FROM public.parts p
    WHERE p.status = 'approved'
      AND p.vehicle_class = _vehicle_class
      AND p.has_photos = true
      AND p.photos IS NOT NULL
      AND array_length(p.photos, 1) > 0
  ),
  scored AS (
    SELECT b.*,
           -- lower score sorts first; recency subtracts up to 0.25 from the random value
           (b.rnd - 0.25 * b.recency) AS score
    FROM base b
  ),
  ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY coalesce(s.seller_id::text,'') ORDER BY s.score) AS seller_rn
    FROM scored s
  )
  SELECT id, title, brand, model, year, price, city, photos, condition, category,
         stock_quantity, oem_code, seller_id, part_type, created_at, seo_slug, is_sold
  FROM ranked
  ORDER BY seen ASC, seller_rn ASC, score ASC
  OFFSET _offset
  LIMIT _limit;
$function$;

REVOKE ALL ON FUNCTION public.home_feed_random(text, text, integer, integer, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.home_feed_random(text, text, integer, integer, uuid[]) TO anon, authenticated, service_role;