
CREATE OR REPLACE FUNCTION public.parts_oem_image_coverage()
RETURNS TABLE (
  total_parts bigint,
  with_photo bigint,
  with_oem bigint,
  matched_in_library bigint,
  unmatched bigint,
  coverage_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_photo bigint := 0;
  v_oem bigint := 0;
  v_matched bigint := 0;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE p.photos IS NOT NULL AND array_length(p.photos,1) > 0),
    count(*) FILTER (WHERE p.oem_families IS NOT NULL AND array_length(p.oem_families,1) > 0),
    count(*) FILTER (
      WHERE p.oem_families IS NOT NULL AND array_length(p.oem_families,1) > 0
        AND EXISTS (
          SELECT 1 FROM public.oem_image_library l
          WHERE l.verified = true AND l.oem_family = ANY(p.oem_families)
        )
    )
  INTO v_total, v_photo, v_oem, v_matched
  FROM public.parts p
  WHERE p.status IN ('approved','active');

  total_parts := v_total;
  with_photo := v_photo;
  with_oem := v_oem;
  matched_in_library := v_matched;
  unmatched := GREATEST(v_oem - v_matched, 0);
  coverage_pct := CASE WHEN v_oem = 0 THEN 0
                       ELSE ROUND(v_matched::numeric / v_oem::numeric * 100, 2) END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.parts_missing_oem_images(_limit int DEFAULT 500)
RETURNS TABLE (
  oem_family text,
  part_count bigint,
  sample_brand text,
  sample_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expanded AS (
    SELECT p.id, p.brand, p.title, unnest(p.oem_families) AS fam
    FROM public.parts p
    WHERE p.status IN ('approved','active') AND p.oem_families IS NOT NULL
  ),
  missing AS (
    SELECT e.fam, e.brand, e.title
    FROM expanded e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.oem_image_library l
      WHERE l.verified = true AND l.oem_family = e.fam
    )
  )
  SELECT
    fam,
    count(*)::bigint,
    (array_agg(brand))[1],
    (array_agg(title))[1]
  FROM missing
  GROUP BY fam
  ORDER BY count(*) DESC
  LIMIT GREATEST(_limit, 1);
$$;
