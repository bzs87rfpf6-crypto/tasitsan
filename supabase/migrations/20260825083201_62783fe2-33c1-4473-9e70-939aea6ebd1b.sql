CREATE OR REPLACE FUNCTION public.vehicle_suggest(_q text, _limit int DEFAULT 5)
RETURNS TABLE(brand text, model text, label text, score real, listings int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  qn   text;
  toks text[];
BEGIN
  qn := trim(public.tr_lower_ascii(coalesce(_q, '')));
  IF length(qn) < 3 THEN RETURN; END IF;

  toks := ARRAY(
    SELECT t FROM unnest(regexp_split_to_array(qn, '[^a-z0-9]+')) AS t
     WHERE length(t) >= 2
  );
  IF coalesce(array_length(toks, 1), 0) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH cand AS (
    SELECT p.brand AS b, p.model AS m, count(*)::int AS n
      FROM public.parts p
     WHERE p.status = 'approved'
       AND coalesce(p.brand, '') <> ''
       AND coalesce(p.model, '') <> ''
     GROUP BY 1, 2
    UNION ALL
    SELECT c.brand, c.vehicle_model, 0
      FROM public.oem_catalog c
     WHERE coalesce(c.brand, '') <> ''
       AND coalesce(c.vehicle_model, '') <> ''
  ), norm AS (
    SELECT public.tr_lower_ascii(cand.b) AS bn,
           public.tr_lower_ascii(cand.m) AS mn,
           cand.b AS b, cand.m AS m, cand.n AS n
      FROM cand
  ), agg AS (
    SELECT n0.bn, n0.mn,
           sum(n0.n)::int AS n,
           (array_agg(n0.b ORDER BY n0.n DESC))[1] AS b,
           (array_agg(n0.m ORDER BY n0.n DESC))[1] AS m
      FROM norm n0
     GROUP BY 1, 2
  ), sc AS (
    SELECT a.b, a.m, a.n,
      (
        SELECT coalesce(sum(
          CASE
            WHEN a.bn = t OR a.mn = t THEN 1.0
            WHEN a.bn LIKE t || '%' OR a.mn LIKE t || '%' THEN 0.9
            WHEN length(t) >= 4 AND (
                   levenshtein(a.mn, t) <= 2 OR levenshtein(a.bn, t) <= 2
                 ) THEN 0.7
            WHEN length(t) >= 4 AND (a.mn LIKE '%' || t || '%' OR a.bn LIKE '%' || t || '%') THEN 0.55
            ELSE 0
          END
        ), 0) / greatest(array_length(toks, 1), 1)
        FROM unnest(toks) AS t
      )::real AS s
      FROM agg a
  )
  SELECT sc.b, sc.m, (sc.b || ' ' || sc.m)::text, sc.s, sc.n
    FROM sc
   WHERE sc.s >= 0.6
   ORDER BY sc.s DESC, sc.n DESC, sc.b, sc.m
   LIMIT greatest(1, least(coalesce(_limit, 5), 10));
END $$;