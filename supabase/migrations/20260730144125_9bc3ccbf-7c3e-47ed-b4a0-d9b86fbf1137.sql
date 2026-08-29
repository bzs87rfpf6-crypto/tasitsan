ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS is_sold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz;
CREATE INDEX IF NOT EXISTS parts_is_sold_idx ON public.parts (is_sold) WHERE is_sold;