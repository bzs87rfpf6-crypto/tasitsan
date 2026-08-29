ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS materialized_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS materialized_at timestamptz,
  ADD COLUMN IF NOT EXISTS materialized_source text;

CREATE INDEX IF NOT EXISTS idx_parts_materialized_by ON public.parts (materialized_by_user_id) WHERE materialized_by_user_id IS NOT NULL;