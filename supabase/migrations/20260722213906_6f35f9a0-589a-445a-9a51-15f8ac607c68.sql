
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_source_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS parts_embedding_hnsw
  ON public.parts USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_parts_semantic(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  min_similarity float DEFAULT 0.35
)
RETURNS TABLE (
  id uuid,
  seo_slug text,
  title text,
  brand text,
  model text,
  year int,
  category text,
  oem_code text,
  oem_codes text[],
  price numeric,
  city text,
  photos text[],
  condition text,
  part_type text,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    p.id, p.seo_slug, p.title, p.brand, p.model, p.year, p.category,
    p.oem_code, p.oem_codes, p.price, p.city, p.photos, p.condition, p.part_type,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.parts p
  WHERE p.status = 'approved'
    AND p.stock_quantity > 0
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) >= min_similarity
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_parts_semantic(vector, int, float) TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.parts_needing_embedding AS
  SELECT id, title, brand, model, category, oem_code, embedding_updated_at
  FROM public.parts
  WHERE status = 'approved'
    AND (embedding IS NULL OR embedding_updated_at < updated_at);

GRANT SELECT ON public.parts_needing_embedding TO authenticated, service_role;
