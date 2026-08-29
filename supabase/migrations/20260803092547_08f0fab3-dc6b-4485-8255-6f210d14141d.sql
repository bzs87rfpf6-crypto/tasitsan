CREATE OR REPLACE FUNCTION public.seo_boost_candidates(_limit int DEFAULT 10)
RETURNS TABLE (part_id uuid, score int, has_meta boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         COALESCE(m.score, 0)::int,
         (m.part_id IS NOT NULL)
  FROM public.parts p
  LEFT JOIN public.product_seo_meta m ON m.part_id = p.id
  WHERE p.status = 'approved'
    AND (m.part_id IS NULL OR m.in_boost_queue)
  ORDER BY (m.part_id IS NOT NULL), COALESCE(m.score, 0) ASC, p.created_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.seo_boost_candidates(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_boost_candidates(int) TO service_role;

-- Genel bakış sayaçları da meta kaydı olmayan ürünleri kapsasın.
CREATE OR REPLACE FUNCTION public.seo_boost_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'approved', (SELECT count(*) FROM public.parts WHERE status = 'approved'),
    'no_meta', (SELECT count(*) FROM public.parts p LEFT JOIN public.product_seo_meta m ON m.part_id = p.id
                WHERE p.status = 'approved' AND m.part_id IS NULL),
    'boost_queue', (SELECT count(*) FROM public.product_seo_meta WHERE in_boost_queue),
    'not_indexed', (SELECT count(*) FROM public.product_seo_meta
                    WHERE index_state IN ('crawled_not_indexed','discovered_not_indexed','excluded')),
    'indexed', (SELECT count(*) FROM public.product_seo_meta WHERE index_state = 'indexed'),
    'gsc_checked', (SELECT count(*) FROM public.product_seo_meta WHERE gsc_checked_at IS NOT NULL),
    'boosted', (SELECT count(*) FROM public.product_seo_meta WHERE boosted_at IS NOT NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.seo_boost_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_boost_overview() TO authenticated, service_role;