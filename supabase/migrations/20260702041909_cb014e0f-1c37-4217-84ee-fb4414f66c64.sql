ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS delivery_options text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS urgent_delivery boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS parts_delivery_options_gin
  ON public.parts USING gin (delivery_options);

CREATE INDEX IF NOT EXISTS parts_urgent_delivery_idx
  ON public.parts (urgent_delivery)
  WHERE urgent_delivery = true;

COMMENT ON COLUMN public.parts.delivery_options IS
  'Delivery options: same_day, express_24h, bus, cargo, ambar, hand, nationwide';
COMMENT ON COLUMN public.parts.urgent_delivery IS
  'Seller marked this listing as eligible for urgent/same-day delivery.';