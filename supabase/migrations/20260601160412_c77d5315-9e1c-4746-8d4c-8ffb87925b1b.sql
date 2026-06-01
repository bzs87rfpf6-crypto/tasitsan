
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS oem_code TEXT;
ALTER TABLE public.parts ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_parts_oem_code ON public.parts(oem_code);
CREATE INDEX IF NOT EXISTS idx_parts_category ON public.parts(category);
CREATE INDEX IF NOT EXISTS idx_parts_brand ON public.parts(brand);

CREATE TABLE IF NOT EXISTS public.part_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  search_query TEXT,
  brand TEXT,
  model TEXT,
  year INTEGER,
  category TEXT,
  oem_code TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_requests TO authenticated;
GRANT ALL ON public.part_requests TO service_role;

ALTER TABLE public.part_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users create part requests"
ON public.part_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers see own part requests"
ON public.part_requests FOR SELECT TO authenticated
USING (auth.uid() = buyer_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update part requests"
ON public.part_requests FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete part requests"
ON public.part_requests FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_part_requests_updated_at
BEFORE UPDATE ON public.part_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
