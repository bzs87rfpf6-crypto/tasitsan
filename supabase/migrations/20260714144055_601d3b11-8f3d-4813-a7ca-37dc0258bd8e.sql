
-- Add new enum values
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'bekliyor';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'odeme_alindi';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'teslim_edildi';

-- New columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method text,
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'bireysel',
  ADD COLUMN IF NOT EXISTS billing_company text,
  ADD COLUMN IF NOT EXISTS tax_office text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text;

CREATE INDEX IF NOT EXISTS orders_urgent_idx ON public.orders(is_urgent) WHERE is_urgent = true;

-- Change default order_number format to TS-YYYYMMDD-000001
ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT ('TS-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.orders_number_seq')::text,6,'0'));

-- Seller can update own orders (status + tracking)
DROP POLICY IF EXISTS orders_update_seller ON public.orders;
CREATE POLICY orders_update_seller ON public.orders
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = orders.id AND oi.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = orders.id AND oi.seller_id = auth.uid()));
