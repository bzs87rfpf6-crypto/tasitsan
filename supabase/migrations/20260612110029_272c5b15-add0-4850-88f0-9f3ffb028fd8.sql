
-- Enum: listing status
DO $$ BEGIN
  CREATE TYPE public.stok_listing_status AS ENUM ('draft','pending_review','active','offer_collecting','sold','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Listings
CREATE TABLE IF NOT EXISTS public.stok_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  city text,
  estimated_item_count integer,
  estimated_oem_count integer,
  expected_price numeric,
  status public.stok_listing_status NOT NULL DEFAULT 'pending_review',
  expert_requested boolean NOT NULL DEFAULT false,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stok_listings TO authenticated;
GRANT ALL ON public.stok_listings TO service_role;

ALTER TABLE public.stok_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stok_listings owner read" ON public.stok_listings
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role)
    OR status IN ('active','offer_collecting'));

CREATE POLICY "stok_listings owner insert" ON public.stok_listings
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "stok_listings owner update" ON public.stok_listings
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "stok_listings admin delete" ON public.stok_listings
  FOR DELETE TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS stok_listings_seller_idx ON public.stok_listings(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stok_listings_status_idx ON public.stok_listings(status, created_at DESC);

CREATE TRIGGER stok_listings_set_updated_at
  BEFORE UPDATE ON public.stok_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Offers
CREATE TABLE IF NOT EXISTS public.stok_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.stok_listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_amount numeric NOT NULL CHECK (offer_amount >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stok_offers TO authenticated;
GRANT ALL ON public.stok_offers TO service_role;

ALTER TABLE public.stok_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stok_offers visibility" ON public.stok_offers
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.stok_listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
  );

CREATE POLICY "stok_offers buyer insert" ON public.stok_offers
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.stok_listings l WHERE l.id = listing_id AND l.status IN ('active','offer_collecting')));

CREATE POLICY "stok_offers buyer update" ON public.stok_offers
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "stok_offers delete" ON public.stok_offers
  FOR DELETE TO authenticated
  USING (buyer_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS stok_offers_listing_idx ON public.stok_offers(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stok_offers_buyer_idx ON public.stok_offers(buyer_id, created_at DESC);

-- Admin notification on new listing & expert request
CREATE OR REPLACE FUNCTION public.notify_admin_stok_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    CASE WHEN NEW.expert_requested THEN 'stok_expert_request' ELSE 'stok_new_listing' END,
    CASE WHEN NEW.expert_requested THEN 'high' ELSE 'normal' END,
    CASE WHEN NEW.expert_requested THEN '🔍 Stok Borsası ekspertiz talebi' ELSE '📦 Yeni Stok Borsası ilanı' END,
    COALESCE(NEW.title,'(başlıksız)') || COALESCE(' · ' || NEW.city, ''),
    '/admin?tab=stok',
    NEW.id, NEW.seller_id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stok_listings_notify_admin ON public.stok_listings;
CREATE TRIGGER stok_listings_notify_admin
  AFTER INSERT ON public.stok_listings
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_stok_listing();

-- Notify seller on new offer
CREATE OR REPLACE FUNCTION public.notify_seller_stok_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seller uuid; v_title text;
BEGIN
  SELECT seller_id, title INTO v_seller, v_title FROM public.stok_listings WHERE id = NEW.listing_id;
  IF v_seller IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
  VALUES (v_seller, 'stok_offer', '💰 Stok Borsası teklifi',
    COALESCE(v_title,'') || ' · ' || NEW.offer_amount::text || ' TL',
    '/account/stok', NEW.listing_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stok_offers_notify_seller ON public.stok_offers;
CREATE TRIGGER stok_offers_notify_seller
  AFTER INSERT ON public.stok_offers
  FOR EACH ROW EXECUTE FUNCTION public.notify_seller_stok_offer();
