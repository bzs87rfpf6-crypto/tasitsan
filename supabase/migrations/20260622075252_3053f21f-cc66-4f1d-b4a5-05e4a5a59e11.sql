CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.oem_cross_reference (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  oem_code TEXT NOT NULL,
  oem_normalized TEXT NOT NULL,
  equivalent_code TEXT NOT NULL,
  equivalent_normalized TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year_range TEXT,
  category TEXT,
  product_name TEXT,
  source TEXT NOT NULL DEFAULT 'partman.gr',
  source_url TEXT,
  confidence INTEGER NOT NULL DEFAULT 80,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oem_normalized, equivalent_normalized, source)
);

CREATE INDEX idx_oem_xref_oem_norm ON public.oem_cross_reference (oem_normalized);
CREATE INDEX idx_oem_xref_equiv_norm ON public.oem_cross_reference (equivalent_normalized);
CREATE INDEX idx_oem_xref_brand_model ON public.oem_cross_reference (brand, model);

GRANT SELECT ON public.oem_cross_reference TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oem_cross_reference TO authenticated;
GRANT ALL ON public.oem_cross_reference TO service_role;

ALTER TABLE public.oem_cross_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cross-references"
  ON public.oem_cross_reference FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage cross-references"
  ON public.oem_cross_reference FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_oem_xref_updated_at
  BEFORE UPDATE ON public.oem_cross_reference
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Find equivalents in both directions for a given OEM
CREATE OR REPLACE FUNCTION public.find_oem_equivalents(_oem_normalized TEXT)
RETURNS TABLE (
  equivalent_code TEXT,
  equivalent_normalized TEXT,
  brand TEXT,
  model TEXT,
  year_range TEXT,
  category TEXT,
  product_name TEXT,
  source TEXT,
  confidence INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT equivalent_code, equivalent_normalized, brand, model, year_range, category, product_name, source, confidence
    FROM public.oem_cross_reference
   WHERE oem_normalized = _oem_normalized
  UNION
  SELECT oem_code, oem_normalized, brand, model, year_range, category, product_name, source, confidence
    FROM public.oem_cross_reference
   WHERE equivalent_normalized = _oem_normalized
$$;

GRANT EXECUTE ON FUNCTION public.find_oem_equivalents(TEXT) TO anon, authenticated, service_role;