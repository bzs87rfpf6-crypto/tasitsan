ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS supplier_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minimum_order_amount numeric,
  ADD COLUMN IF NOT EXISTS single_shipment_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS procurement_days integer;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS supplier_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procurement_days integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS has_supplier_items boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_parts_supplier_stock ON public.parts (supplier_stock) WHERE supplier_stock;