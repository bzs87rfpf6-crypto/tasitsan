
CREATE OR REPLACE FUNCTION public.seller_demand_insights(_range text DEFAULT '30d')
RETURNS TABLE(
  part_id uuid,
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
    SELECT p.id, p.title, p.brand, p.model, p.photos, p.oem_codes, p.category
    FROM public.parts p
    WHERE p.seller_id = auth.uid()
  )
  SELECT
    mp.id AS part_id,
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
    -- score by relevance to surface high-demand listings first
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
  sample_part_id uuid
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
    (SELECT p.title FROM public.parts p
       WHERE p.status='approved' AND t.oem = ANY(p.oem_codes)
       ORDER BY p.created_at DESC LIMIT 1) AS sample_title,
    (SELECT p.brand FROM public.parts p
       WHERE p.status='approved' AND t.oem = ANY(p.oem_codes)
       ORDER BY p.created_at DESC LIMIT 1) AS sample_brand,
    (SELECT p.model FROM public.parts p
       WHERE p.status='approved' AND t.oem = ANY(p.oem_codes)
       ORDER BY p.created_at DESC LIMIT 1) AS sample_model,
    (SELECT p.id FROM public.parts p
       WHERE p.status='approved' AND t.oem = ANY(p.oem_codes)
       ORDER BY p.created_at DESC LIMIT 1) AS sample_part_id
  FROM top_oem t
  ORDER BY t.search_count DESC;
END $$;

REVOKE ALL ON FUNCTION public.top_demand_parts(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.top_demand_parts(text, integer) TO authenticated;
