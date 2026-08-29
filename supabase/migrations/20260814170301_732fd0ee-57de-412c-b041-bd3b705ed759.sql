-- 1) Ürün kaynağı (public-safe alanlar)
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'own_stock',
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_product_id text,
  ADD COLUMN IF NOT EXISTS supplier_oem text,
  ADD COLUMN IF NOT EXISTS supplier_stock_status text,
  ADD COLUMN IF NOT EXISTS supplier_last_checked_at timestamptz;

CREATE OR REPLACE FUNCTION public.parts_source_type_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source_type NOT IN ('own_stock','external_supplier') THEN
    RAISE EXCEPTION 'Geçersiz source_type: %', NEW.source_type;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_parts_source_type_check ON public.parts;
CREATE TRIGGER trg_parts_source_type_check BEFORE INSERT OR UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.parts_source_type_check();

-- Duplicate kontrolü: aynı tedarikçi ürünü tek kayıt
CREATE UNIQUE INDEX IF NOT EXISTS parts_supplier_unique
  ON public.parts (supplier_name, supplier_product_id)
  WHERE source_type = 'external_supplier' AND supplier_name IS NOT NULL AND supplier_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS parts_source_type_idx ON public.parts (source_type);

-- 2) Tedarikçi maliyet bilgileri (yalnızca admin)
CREATE TABLE IF NOT EXISTS public.part_supplier_costs (
  part_id uuid PRIMARY KEY REFERENCES public.parts(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  supplier_product_id text,
  supplier_cost_price numeric,
  margin_percent numeric,
  sale_price numeric,
  supplier_last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_supplier_costs TO authenticated;
GRANT ALL ON public.part_supplier_costs TO service_role;
ALTER TABLE public.part_supplier_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage part supplier costs" ON public.part_supplier_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 3) Sipariş kalemi kaynağı
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'own_stock',
  ADD COLUMN IF NOT EXISTS supplier_name text;

CREATE TABLE IF NOT EXISTS public.order_item_supply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'external_supplier',
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  supplier_product_id text,
  supplier_cost_price numeric,
  supplier_sale_price numeric,
  supply_status text NOT NULL DEFAULT 'pending_supplier_order',
  supplier_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_supply TO authenticated;
GRANT ALL ON public.order_item_supply TO service_role;
ALTER TABLE public.order_item_supply ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order item supply" ON public.order_item_supply
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.order_item_supply_status_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.supply_status NOT IN ('pending_supplier_order','supplier_ordered','supplier_confirmed','in_transit','received','shipped_to_customer','completed','supplier_cancelled') THEN
    RAISE EXCEPTION 'Geçersiz tedarik durumu: %', NEW.supply_status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_order_item_supply_status ON public.order_item_supply;
CREATE TRIGGER trg_order_item_supply_status BEFORE INSERT OR UPDATE ON public.order_item_supply
  FOR EACH ROW EXECUTE FUNCTION public.order_item_supply_status_check();

CREATE INDEX IF NOT EXISTS order_item_supply_order_idx ON public.order_item_supply (order_id);

-- 4) Tedarikçi durum alanları
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

INSERT INTO public.suppliers (name, supplier_type, product_type, active, default_margin)
SELECT 'OnlineParça', 'external', 'yedek_parca', true, 20
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE name = 'OnlineParça');
