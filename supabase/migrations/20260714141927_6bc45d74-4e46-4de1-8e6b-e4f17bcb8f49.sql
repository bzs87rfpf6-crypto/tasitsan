
-- Enum
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('yeni','hazirlaniyor','teklif_bekliyor','odeme_bekliyor','kargoda','tamamlandi','iptal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sequence for order numbers
CREATE SEQUENCE IF NOT EXISTS public.orders_number_seq START 100000;

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('TS-' || to_char(now(),'YYMM') || '-' || lpad(nextval('public.orders_number_seq')::text,6,'0')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  company text,
  phone text NOT NULL,
  email text,
  city text,
  note text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  shipping numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  has_quote_items boolean NOT NULL DEFAULT false,
  status public.order_status NOT NULL DEFAULT 'yeni',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT INSERT, SELECT ON public.orders TO anon;
GRANT ALL ON public.orders TO service_role;
GRANT USAGE ON SEQUENCE public.orders_number_seq TO anon, authenticated, service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Order items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  oem_code text,
  product_code text,
  seller_name text,
  photo text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12,2),
  line_total numeric(12,2),
  is_quote boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_seller_id_idx ON public.order_items(seller_id);
CREATE INDEX IF NOT EXISTS order_items_part_id_idx ON public.order_items(part_id);

GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_items TO anon;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- updated_at trigger for orders
CREATE OR REPLACE FUNCTION public.orders_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS orders_touch_updated_at ON public.orders;
CREATE TRIGGER orders_touch_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_touch_updated_at();

-- RLS policies for orders
DROP POLICY IF EXISTS "orders_insert_any" ON public.orders;
CREATE POLICY "orders_insert_any" ON public.orders
FOR INSERT TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_select_admin" ON public.orders;
CREATE POLICY "orders_select_admin" ON public.orders
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "orders_select_seller" ON public.orders;
CREATE POLICY "orders_select_seller" ON public.orders
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = orders.id AND oi.seller_id = auth.uid()));

DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
CREATE POLICY "orders_update_admin" ON public.orders
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for order_items
DROP POLICY IF EXISTS "order_items_insert_any" ON public.order_items;
CREATE POLICY "order_items_insert_any" ON public.order_items
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
CREATE POLICY "order_items_select_own" ON public.order_items
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
  OR seller_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
