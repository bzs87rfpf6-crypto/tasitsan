ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS system_seller_id uuid,
  ADD COLUMN IF NOT EXISTS cache_ttl_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

CREATE INDEX IF NOT EXISTS parts_supplier_oem_idx
  ON public.parts (supplier_oem)
  WHERE source_type = 'external_supplier';

CREATE INDEX IF NOT EXISTS order_item_supply_order_idx
  ON public.order_item_supply (order_id);