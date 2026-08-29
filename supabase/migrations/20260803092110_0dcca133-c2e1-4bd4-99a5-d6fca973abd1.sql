ALTER TABLE public.product_seo_meta
  ADD COLUMN IF NOT EXISTS index_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS index_verdict text,
  ADD COLUMN IF NOT EXISTS last_crawl_at timestamptz,
  ADD COLUMN IF NOT EXISTS gsc_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_boost_queue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS boosted_at timestamptz,
  ADD COLUMN IF NOT EXISTS boost_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS product_seo_meta_index_state_idx ON public.product_seo_meta (index_state);
CREATE INDEX IF NOT EXISTS product_seo_meta_boost_queue_idx ON public.product_seo_meta (in_boost_queue) WHERE in_boost_queue;

-- Puanı 80'in altında olan veya indekslenmemiş ürünler otomatik kuyruğa girer.
CREATE OR REPLACE FUNCTION public._tg_seo_boost_queue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.in_boost_queue :=
    COALESCE(NEW.score, 0) < 80
    OR NEW.index_state IN ('crawled_not_indexed', 'discovered_not_indexed', 'excluded');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_boost_queue ON public.product_seo_meta;
CREATE TRIGGER trg_seo_boost_queue
  BEFORE INSERT OR UPDATE OF score, index_state ON public.product_seo_meta
  FOR EACH ROW EXECUTE FUNCTION public._tg_seo_boost_queue();

UPDATE public.product_seo_meta
SET in_boost_queue = (COALESCE(score, 0) < 80);

-- Yönetici listesi: indeks bekleyen / zayıf ürünler.
CREATE OR REPLACE FUNCTION public.seo_index_pending(
  _filter text DEFAULT 'pending',
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  part_id uuid,
  title text,
  seo_slug text,
  url text,
  score int,
  index_state text,
  index_verdict text,
  last_crawl_at timestamptz,
  gsc_checked_at timestamptz,
  internal_links_count int,
  alt_texts_count int,
  has_meta boolean,
  canonical_ok boolean,
  schema_ok boolean,
  issues jsonb,
  in_boost_queue boolean,
  boosted_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      m.part_id,
      COALESCE(NULLIF(m.title, ''), p.title) AS title,
      p.seo_slug,
      'https://tasitsan.com.tr/parts/' || COALESCE(p.seo_slug, p.id::text) AS url,
      COALESCE(m.score, 0)::int AS score,
      m.index_state,
      m.index_verdict,
      m.last_crawl_at,
      m.gsc_checked_at,
      COALESCE(jsonb_array_length(m.internal_links), 0)::int AS internal_links_count,
      COALESCE(jsonb_array_length(m.alt_texts), 0)::int AS alt_texts_count,
      (COALESCE(length(m.description), 0) >= 80 AND COALESCE(length(m.title), 0) >= 20) AS has_meta,
      (p.seo_slug IS NOT NULL AND p.seo_slug <> '') AS canonical_ok,
      (COALESCE(m.attributes->>'brand', '') <> '' AND COALESCE(m.attributes->>'oem_primary', '') <> '') AS schema_ok,
      COALESCE(m.issues, '[]'::jsonb) AS issues,
      m.in_boost_queue,
      m.boosted_at
    FROM public.product_seo_meta m
    JOIN public.parts p ON p.id = m.part_id
    WHERE p.status = 'approved'
      AND (
        _filter = 'all'
        OR (_filter = 'pending' AND (m.in_boost_queue OR m.index_state IN ('crawled_not_indexed', 'discovered_not_indexed', 'excluded')))
        OR (_filter = 'not_indexed' AND m.index_state IN ('crawled_not_indexed', 'discovered_not_indexed', 'excluded'))
        OR (_filter = 'low_score' AND COALESCE(m.score, 0) < 80)
        OR (_filter = 'indexed' AND m.index_state = 'indexed')
      )
  ), counted AS (
    SELECT count(*) AS c FROM base
  )
  SELECT b.*, counted.c
  FROM base b, counted
  ORDER BY b.score ASC, b.gsc_checked_at ASC NULLS FIRST
  LIMIT LEAST(GREATEST(_limit, 1), 500)
  OFFSET GREATEST(_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.seo_index_pending(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_index_pending(text, int, int) TO authenticated, service_role;