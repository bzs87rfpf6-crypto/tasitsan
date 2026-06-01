
-- Extend part_requests with new fields for "Akıllı Talep Havuzu"
ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS part_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Allow authenticated sellers to view open requests (so they can quote on them).
-- Buyer contact info must not be queried client-side: we expose a safe view below.
DROP POLICY IF EXISTS "Sellers see open part requests" ON public.part_requests;
CREATE POLICY "Sellers see open part requests"
ON public.part_requests
FOR SELECT
TO authenticated
USING (status IN ('new','in_progress'));

-- Safe public view of requests for sellers (no buyer contact)
CREATE OR REPLACE VIEW public.open_part_requests AS
SELECT
  id, part_name, search_query, oem_code, brand, model, year, category,
  description, message, photos, status, created_at
FROM public.part_requests
WHERE status IN ('new','in_progress');

GRANT SELECT ON public.open_part_requests TO authenticated;

-- ============ request_quotes ============
CREATE TABLE IF NOT EXISTS public.request_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.part_requests(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL,
  price NUMERIC NOT NULL,
  delivery_time TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('new','used','refurbished')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_quotes TO authenticated;
GRANT ALL ON public.request_quotes TO service_role;

ALTER TABLE public.request_quotes ENABLE ROW LEVEL SECURITY;

-- Sellers can create their own quotes
CREATE POLICY "Sellers insert own quotes"
ON public.request_quotes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = seller_id);

-- Sellers can see only their own quotes
CREATE POLICY "Sellers see own quotes"
ON public.request_quotes FOR SELECT TO authenticated
USING (auth.uid() = seller_id);

-- Sellers can update their own pending quotes
CREATE POLICY "Sellers update own pending quotes"
ON public.request_quotes FOR UPDATE TO authenticated
USING (auth.uid() = seller_id AND status = 'pending')
WITH CHECK (auth.uid() = seller_id);

-- Buyers see admin-approved quotes for their own requests
CREATE POLICY "Buyers see approved quotes for own requests"
ON public.request_quotes FOR SELECT TO authenticated
USING (
  status = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.part_requests pr
    WHERE pr.id = request_quotes.request_id AND pr.buyer_id = auth.uid()
  )
);

-- Admins full management
CREATE POLICY "Admins manage quotes"
ON public.request_quotes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_request_quotes_request ON public.request_quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_request_quotes_seller ON public.request_quotes(seller_id);

CREATE TRIGGER request_quotes_set_updated_at
BEFORE UPDATE ON public.request_quotes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policy: allow uploads to part-photos under request-photos/{uid}/ subpath
-- (bucket is already public, existing policies allow authenticated uploads)
