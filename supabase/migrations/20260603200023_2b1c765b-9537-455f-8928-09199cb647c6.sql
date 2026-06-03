
ALTER TABLE public.part_requests
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_part_requests_urgent ON public.part_requests (is_urgent, created_at DESC) WHERE is_urgent = true;

ALTER TABLE public.request_quotes
  ADD COLUMN IF NOT EXISTS stock_quantity integer;

ALTER TABLE public.request_quotes ALTER COLUMN delivery_time DROP NOT NULL;
ALTER TABLE public.request_quotes ALTER COLUMN condition DROP NOT NULL;

-- Safe-projection function for suppliers: NO PII (name/phone/email)
CREATE OR REPLACE FUNCTION public.list_urgent_requests_for_supplier(_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  oem_code text,
  part_name text,
  brand text,
  model text,
  year int,
  city text,
  category text,
  notes text,
  created_at timestamptz,
  has_my_quote boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.oem_code, pr.part_name, pr.brand, pr.model, pr.year,
         pr.city, pr.category, pr.notes, pr.created_at,
         EXISTS(SELECT 1 FROM public.request_quotes q
                WHERE q.request_id = pr.id AND q.seller_id = auth.uid()) AS has_my_quote
  FROM public.part_requests pr
  WHERE pr.is_urgent = true
    AND pr.status IN ('new','in_progress')
    AND auth.uid() IS NOT NULL
  ORDER BY pr.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.list_urgent_requests_for_supplier(int) TO authenticated;

-- Single urgent request view for suppliers (safe projection)
CREATE OR REPLACE FUNCTION public.get_urgent_request_for_supplier(_id uuid)
RETURNS TABLE (
  id uuid,
  oem_code text,
  part_name text,
  brand text,
  model text,
  year int,
  city text,
  category text,
  notes text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.oem_code, pr.part_name, pr.brand, pr.model, pr.year,
         pr.city, pr.category, pr.notes, pr.created_at
  FROM public.part_requests pr
  WHERE pr.id = _id
    AND pr.is_urgent = true
    AND pr.status IN ('new','in_progress')
    AND auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_urgent_request_for_supplier(uuid) TO authenticated;
