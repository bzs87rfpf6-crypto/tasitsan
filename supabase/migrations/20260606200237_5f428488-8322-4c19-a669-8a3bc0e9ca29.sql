ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS part_type text
    CHECK (part_type IS NULL OR part_type IN ('original','equivalent','aftermarket','used','refurbished'));

CREATE INDEX IF NOT EXISTS idx_parts_part_type ON public.parts(part_type);