DROP FUNCTION IF EXISTS public.seller_demand_insights(text);
DROP FUNCTION IF EXISTS public.top_demand_parts(text, integer);

CREATE OR REPLACE FUNCTION public.seller_demand_insights(_range text DEFAULT '30d')
RETURNS TABLE(
  part_id uuid,
  seo_slug text,
  title text,
  brand text,
  model text,
  photos text[],
  oem_codes text[],
  searches_7d bigint,
  searches_30d bigint,
  searches_today bigint,
  active_requests bigint,
  alert_watchers bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  WITH my_parts AS (
    SELECT p.id, p.seo_slug, p.title, p.brand, p.model, p.photos, p.oem_codes, p.category
    FROM public.parts p
    WHERE p.seller_id = auth.uid()
  )
  SELECT
    mp.id AS part_id,
    mp.seo_slug,
    mp.title,
    mp.brand,
    mp.model,
    mp.photos,
    mp.oem_codes,
    COALESCE((
      SELECT count(*) FROM public.oem_searches s
      WHERE array_length(mp.oem_codes,1) IS NOT NULL
        AND s.oem = ANY(mp.oem_codes)
        AND s.created_at >= now() - interval '7 days'
    ), 0)::bigint AS searches_7d,
    COALESCE((
      SELECT count(*) FROM public.oem_searches s
      WHERE array_length(mp.oem_codes,1) IS NOT NULL
        AND s.oem = ANY(mp.oem_codes)
        AND s.created_at >= now() - interval '30 days'
    ), 0)::bigint AS searches_30d,
    COALESCE((
      SELECT count(*) FROM public.oem_searches s
      WHERE array_length(mp.oem_codes,1) IS NOT NULL
        AND s.oem = ANY(mp.oem_codes)
        AND s.created_at >= date_trunc('day', now())
    ), 0)::bigint AS searches_today,
    COALESCE((
      SELECT count(*) FROM public.part_requests pr
      WHERE pr.status IN ('new','in_progress')
        AND pr.created_at >= now() - interval '90 days'
        AND (
          (array_length(mp.oem_codes,1) IS NOT NULL AND upper(coalesce(pr.oem_code,'')) = ANY(mp.oem_codes))
          OR (mp.brand IS NOT NULL AND pr.brand ILIKE mp.brand
              AND (mp.model IS NULL OR pr.model ILIKE mp.model))
        )
    ), 0)::bigint AS active_requests,
    COALESCE((
      SELECT count(DISTINCT a.user_id) FROM public.part_alerts a
      WHERE a.is_active = true
        AND (
          (a.oem_code IS NOT NULL AND array_length(mp.oem_codes,1) IS NOT NULL AND a.oem_code = ANY(mp.oem_codes))
          OR (a.keyword IS NOT NULL AND (
                mp.title ILIKE '%' || a.keyword || '%'
             OR coalesce(mp.brand,'') ILIKE '%' || a.keyword || '%'
             OR coalesce(mp.model,'') ILIKE '%' || a.keyword || '%'
          ))
          OR (a.brand IS NOT NULL AND mp.brand IS NOT NULL AND mp.brand ILIKE a.brand
              AND (a.model IS NULL OR (mp.model IS NOT NULL AND mp.model ILIKE a.model)))
        )
    ), 0)::bigint AS alert_watchers
  FROM my_parts mp
  ORDER BY (
    COALESCE((SELECT count(*) FROM public.oem_searches s
      WHERE array_length(mp.oem_codes,1) IS NOT NULL
        AND s.oem = ANY(mp.oem_codes)
        AND s.created_at >= now() - interval '30 days'), 0)
  ) DESC;
END $$;

REVOKE ALL ON FUNCTION public.seller_demand_insights(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_demand_insights(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.top_demand_parts(_range text DEFAULT '7d', _limit integer DEFAULT 20)
RETURNS TABLE(
  oem text,
  search_count bigint,
  request_count bigint,
  sample_title text,
  sample_brand text,
  sample_model text,
  sample_part_id uuid,
  sample_seo_slug text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_from := CASE _range
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d'    THEN now() - interval '7 days'
    WHEN '30d'   THEN now() - interval '30 days'
    ELSE now() - interval '7 days'
  END;

  RETURN QUERY
  WITH top_oem AS (
    SELECT upper(trim(s.oem)) AS oem, count(*)::bigint AS search_count
    FROM public.oem_searches s
    WHERE s.created_at >= v_from
    GROUP BY 1
    ORDER BY search_count DESC
    LIMIT GREATEST(1, LEAST(_limit, 50))
  ), sample_parts AS (
    SELECT DISTINCT ON (t.oem)
      t.oem,
      p.id,
      p.seo_slug,
      p.title,
      p.brand,
      p.model
    FROM top_oem t
    JOIN public.parts p ON p.status = 'approved' AND t.oem = ANY(p.oem_codes)
    ORDER BY t.oem, p.created_at DESC
  )
  SELECT
    t.oem,
    t.search_count,
    COALESCE((
      SELECT count(*) FROM public.part_requests pr
      WHERE pr.status IN ('new','in_progress')
        AND pr.created_at >= v_from
        AND upper(coalesce(pr.oem_code,'')) = t.oem
    ), 0)::bigint AS request_count,
    sp.title AS sample_title,
    sp.brand AS sample_brand,
    sp.model AS sample_model,
    sp.id AS sample_part_id,
    sp.seo_slug AS sample_seo_slug
  FROM top_oem t
  LEFT JOIN sample_parts sp ON sp.oem = t.oem
  ORDER BY t.search_count DESC;
END $$;

REVOKE ALL ON FUNCTION public.top_demand_parts(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.top_demand_parts(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH most_searched AS (
    SELECT s.oem, count(*)::int AS search_count,
           (SELECT count(*)::int FROM public.parts p WHERE p.status='approved' AND s.oem = ANY(p.oem_codes)) AS listing_count,
           (SELECT jsonb_build_object('id', p.id, 'seo_slug', p.seo_slug, 'title', p.title, 'price', p.price)
              FROM public.parts p WHERE p.status='approved' AND s.oem = ANY(p.oem_codes)
              ORDER BY p.created_at DESC LIMIT 1) AS sample
    FROM public.oem_searches s
    WHERE s.created_at >= now() - interval '30 days'
    GROUP BY s.oem
    ORDER BY count(*) DESC
    LIMIT 10
  ), fastest AS (
    SELECT p.id, p.seo_slug, p.title, p.brand, p.model, p.price,
           count(v.*)::int AS views_7d
    FROM public.parts p
    LEFT JOIN public.part_views v ON v.part_id = p.id AND v.created_at >= now() - interval '7 days'
    WHERE p.status = 'approved'
    GROUP BY p.id
    ORDER BY count(v.*) DESC, p.created_at DESC
    LIMIT 10
  ), slow AS (
    SELECT p.id, p.seo_slug, p.title, p.brand, p.model, p.price, p.city,
           EXTRACT(day FROM now() - p.created_at)::int AS age_days,
           COALESCE((SELECT count(*)::int FROM public.part_views v WHERE v.part_id=p.id AND v.created_at >= now() - interval '30 days'),0) AS views_30d,
           'Fiyatı ve görselleri güncelleyerek görünürlüğü artırın.'::text AS recommendation
    FROM public.parts p
    WHERE p.status = 'approved' AND p.created_at < now() - interval '60 days'
    ORDER BY views_30d ASC, p.created_at ASC
    LIMIT 10
  ), vehicles AS (
    SELECT coalesce(brand,'') AS brand, coalesce(model,'') AS model, count(*)::int AS demand_count
    FROM public.part_requests
    WHERE created_at >= now() - interval '30 days'
      AND (brand IS NOT NULL OR model IS NOT NULL)
    GROUP BY 1,2
    ORDER BY count(*) DESC
    LIMIT 8
  )
  SELECT jsonb_build_object(
    'most_searched', COALESCE((SELECT jsonb_agg(to_jsonb(most_searched)) FROM most_searched), '[]'::jsonb),
    'fastest_selling', COALESCE((SELECT jsonb_agg(to_jsonb(fastest)) FROM fastest), '[]'::jsonb),
    'slow_moving', COALESCE((SELECT jsonb_agg(to_jsonb(slow)) FROM slow), '[]'::jsonb),
    'top_vehicles', COALESCE((SELECT jsonb_agg(to_jsonb(vehicles)) FROM vehicles), '[]'::jsonb),
    'stale_recs', COALESCE((SELECT jsonb_agg(to_jsonb(slow)) FROM slow), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stock_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_dashboard_stats() TO service_role;