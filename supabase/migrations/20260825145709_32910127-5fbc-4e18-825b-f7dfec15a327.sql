CREATE OR REPLACE FUNCTION public.onlineparca_brand_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH n AS (
    SELECT upper(translate(btrim(brand), 'İIıiŞşĞğÜüÖöÇç', 'IIIISSGGUUOOCC')) AS b,
           count(*) AS c
    FROM public.oem_catalog
    WHERE brand IS NOT NULL AND btrim(brand) <> ''
    GROUP BY 1
  ), c AS (
    SELECT CASE b WHEN 'VW' THEN 'VOLKSWAGEN' WHEN 'CHERRY' THEN 'CHERY' ELSE b END AS brand,
           sum(c)::bigint AS oem_count
    FROM n
    WHERE b !~ '[^A-Z0-9\-]' AND length(b) BETWEEN 2 AND 20
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'brand_count', (SELECT count(*) FROM c),
    'oem_count', COALESCE((SELECT sum(oem_count) FROM c), 0),
    'brands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('brand', brand, 'oem_count', oem_count, 'part_type', 'original')
                       ORDER BY oem_count DESC)
      FROM c
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.onlineparca_brand_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.onlineparca_brand_stats() TO anon, authenticated, service_role;