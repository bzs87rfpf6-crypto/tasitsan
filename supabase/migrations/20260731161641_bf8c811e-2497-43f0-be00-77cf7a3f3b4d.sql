CREATE OR REPLACE FUNCTION public.home_feed_random(_vehicle_class text, _seed text, _limit integer DEFAULT 24, _offset integer DEFAULT 0, _exclude uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(id uuid, title text, brand text, model text, year integer, price numeric, city text, photos text[], condition text, category text, stock_quantity integer, oem_code text, seller_id uuid, part_type text, created_at timestamp with time zone, seo_slug text, is_sold boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS (
    SELECT p.id, p.title, p.brand, p.model, p.year, p.price, p.city, p.photos,
           p.condition, p.category, p.stock_quantity, p.oem_code, p.seller_id,
           p.part_type, p.created_at, p.seo_slug, p.is_sold,
           ('x' || substr(md5(p.id::text || '|' || coalesce(_seed,'')), 1, 8))::bit(32)::bigint
             / 4294967295.0 AS rnd,
           greatest(0.0, 1.0 - (extract(epoch FROM (now() - p.created_at)) / 604800.0)) AS recency,
           (p.id = ANY(coalesce(_exclude, '{}'::uuid[]))) AS seen
    FROM public.parts p
    WHERE p.status = 'approved'
      AND p.vehicle_class = _vehicle_class
      AND p.has_photos = true
      AND p.photos IS NOT NULL
      AND array_length(p.photos, 1) > 0
  ),
  fresh AS (SELECT count(*) AS c FROM base WHERE NOT seen),
  scored AS (
    SELECT b.*,
           -- random dominates; new listings get only a mild multiplicative boost
           (b.rnd * (1.0 - 0.15 * b.recency)) AS score
    FROM base b
    WHERE NOT b.seen OR (SELECT c FROM fresh) < (_limit + _offset)
  ),
  ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY coalesce(s.seller_id::text,'') ORDER BY s.score) AS seller_rn
    FROM scored s
  )
  SELECT id, title, brand, model, year, price, city, photos, condition, category,
         stock_quantity, oem_code, seller_id, part_type, created_at, seo_slug, is_sold
  FROM ranked
  ORDER BY seen ASC, (seller_rn + 6 * score) ASC, score ASC
  OFFSET _offset
  LIMIT _limit;
$function$;