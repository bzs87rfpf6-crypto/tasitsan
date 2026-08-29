
WITH stats AS (
  SELECT
    CASE p.category
      WHEN 'Motor' THEN 'motor-parcalari'
      WHEN 'Şanzıman' THEN 'sanziman'
      WHEN 'Fren' THEN 'fren-sistemi'
      WHEN 'Süspansiyon' THEN 'suspansiyon'
      WHEN 'Elektrik' THEN 'elektrik'
      WHEN 'Kaporta' THEN 'kaporta'
      WHEN 'Klima' THEN 'klima'
      WHEN 'Yakıt Sistemi' THEN 'yakit-sistemi'
      WHEN 'Aydınlatma' THEN 'aydinlatma'
      WHEN 'Marş Motoru' THEN 'mars-motoru'
    END AS slug,
    p.category AS name,
    COUNT(*) AS listings,
    COUNT(DISTINCT NULLIF(TRIM(LOWER(p.brand)), '')) AS brands,
    COUNT(DISTINCT oem) AS oems
  FROM public.parts p
  LEFT JOIN LATERAL (
    SELECT UPPER(TRIM(x)) AS oem
    FROM unnest(COALESCE(p.oem_codes, ARRAY[]::text[]) || ARRAY[p.oem_code]) x
    WHERE x IS NOT NULL AND TRIM(x) <> ''
  ) oems ON TRUE
  WHERE p.status = 'approved'
  GROUP BY p.category
)
INSERT INTO public.seo_category_landing (
  category_slug, category_name, listings_count, distinct_brands, distinct_oems, quality_score, indexable, updated_at
)
SELECT
  slug, name, listings, brands, oems,
  LEAST(100, GREATEST(0, ROUND(listings * 0.6 + brands * 2 + oems * 0.5)))::int AS score,
  (LEAST(100, GREATEST(0, ROUND(listings * 0.6 + brands * 2 + oems * 0.5))) >= 40 AND listings >= 6) AS indexable,
  now()
FROM stats
WHERE slug IS NOT NULL
ON CONFLICT (category_slug) DO UPDATE SET
  category_name = EXCLUDED.category_name,
  listings_count = EXCLUDED.listings_count,
  distinct_brands = EXCLUDED.distinct_brands,
  distinct_oems = EXCLUDED.distinct_oems,
  quality_score = EXCLUDED.quality_score,
  indexable = EXCLUDED.indexable,
  updated_at = now();
