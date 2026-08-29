ALTER TABLE public.stok_listings
  ADD COLUMN IF NOT EXISTS expert_completed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS stok_listings_public_idx
  ON public.stok_listings (status, created_at DESC)
  WHERE status IN ('active','offer_collecting');