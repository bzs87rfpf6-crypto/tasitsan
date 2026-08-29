CREATE TABLE public.part_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  notify_price_drop boolean NOT NULL DEFAULT true,
  notify_cheaper_alternative boolean NOT NULL DEFAULT true,
  notify_new_seller boolean NOT NULL DEFAULT false,
  notify_photo_added boolean NOT NULL DEFAULT false,
  notify_back_in_stock boolean NOT NULL DEFAULT true,
  notify_original_found boolean NOT NULL DEFAULT false,
  notify_special_price boolean NOT NULL DEFAULT false,
  target_price numeric,
  base_price numeric,
  is_active boolean NOT NULL DEFAULT true,
  last_notified_at timestamptz,
  notify_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_watches_unique UNIQUE (user_id, part_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_watches TO authenticated;
GRANT ALL ON public.part_watches TO service_role;

ALTER TABLE public.part_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own part watches" ON public.part_watches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX part_watches_part_idx ON public.part_watches(part_id) WHERE is_active;
CREATE INDEX part_watches_user_idx ON public.part_watches(user_id);

CREATE OR REPLACE FUNCTION public.part_watches_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER part_watches_touch_trg
  BEFORE UPDATE ON public.part_watches
  FOR EACH ROW EXECUTE FUNCTION public.part_watches_touch();

-- Notify watchers when the watched part itself changes
CREATE OR REPLACE FUNCTION public.dispatch_part_watch_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
  v_link text;
  v_old_photos int := coalesce(array_length(OLD.photos, 1), 0);
  v_new_photos int := coalesce(array_length(NEW.photos, 1), 0);
  v_price_dropped boolean := NEW.price IS NOT NULL AND OLD.price IS NOT NULL AND NEW.price < OLD.price;
  v_back_in_stock boolean := ((OLD.is_sold AND NOT NEW.is_sold) OR (OLD.stock_quantity <= 0 AND NEW.stock_quantity > 0));
BEGIN
  IF NOT (v_price_dropped OR v_new_photos > v_old_photos OR v_back_in_stock) THEN
    RETURN NEW;
  END IF;

  v_link := '/parts/' || coalesce(NEW.seo_slug, NEW.id::text);

  FOR w IN SELECT * FROM public.part_watches WHERE part_id = NEW.id AND is_active LOOP
    IF v_price_dropped AND w.target_price IS NOT NULL AND NEW.price <= w.target_price THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
      VALUES (w.user_id, 'part_watch_target_price', 'Hedef fiyatınıza ulaşıldı',
        NEW.title || ' artık ' || to_char(NEW.price, 'FM999G999G999D00') || ' TL.',
        v_link, NEW.id);
    ELSIF v_price_dropped AND w.notify_price_drop THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
      VALUES (w.user_id, 'part_watch_price_drop', 'Takip ettiğiniz üründe fiyat düştü',
        NEW.title || ' fiyatı ' || to_char(NEW.price, 'FM999G999G999D00') || ' TL oldu.',
        v_link, NEW.id);
    END IF;

    IF v_new_photos > v_old_photos AND w.notify_photo_added THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
      VALUES (w.user_id, 'part_watch_photo', 'Takip ettiğiniz ürüne fotoğraf eklendi',
        NEW.title || ' için güncel fotoğraflar yüklendi.', v_link, NEW.id);
    END IF;

    IF v_back_in_stock AND w.notify_back_in_stock THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
      VALUES (w.user_id, 'part_watch_stock', 'Takip ettiğiniz ürün tekrar stokta',
        NEW.title || ' yeniden satışta.', v_link, NEW.id);
    END IF;

    UPDATE public.part_watches
      SET last_notified_at = now(), notify_count = notify_count + 1
      WHERE id = w.id;
  END LOOP;

  RETURN NEW;
END $$;

CREATE TRIGGER parts_dispatch_watch_updates_trg
  AFTER UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_part_watch_updates();

-- Notify watchers when a cheaper equivalent (same OEM) is published by another listing
CREATE OR REPLACE FUNCTION public.dispatch_part_watch_alternatives()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
  v_link text := '/parts/' || coalesce(NEW.seo_slug, NEW.id::text);
BEGIN
  IF NEW.status <> 'approved' OR NEW.price IS NULL OR NEW.price <= 0 THEN
    RETURN NEW;
  END IF;
  IF coalesce(array_length(NEW.oem_codes, 1), 0) = 0 AND NEW.oem_code IS NULL THEN
    RETURN NEW;
  END IF;

  FOR w IN
    SELECT pw.id, pw.user_id, pw.notify_cheaper_alternative, pw.notify_new_seller, p.price AS watched_price, p.seller_id AS watched_seller
    FROM public.part_watches pw
    JOIN public.parts p ON p.id = pw.part_id
    WHERE pw.is_active
      AND p.id <> NEW.id
      AND p.price IS NOT NULL
      AND (
        (p.oem_code IS NOT NULL AND (p.oem_code = NEW.oem_code OR p.oem_code = ANY(NEW.oem_codes)))
        OR (coalesce(array_length(p.oem_codes, 1), 0) > 0 AND p.oem_codes && NEW.oem_codes)
      )
  LOOP
    IF w.notify_cheaper_alternative AND NEW.price < w.watched_price THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
      VALUES (w.user_id, 'part_watch_cheaper', 'Daha uygun fiyatlı ürün bulundu',
        NEW.title || ' — ' || to_char(NEW.price, 'FM999G999G999D00') || ' TL.', v_link, NEW.id);
      UPDATE public.part_watches SET last_notified_at = now(), notify_count = notify_count + 1 WHERE id = w.id;
    ELSIF w.notify_new_seller AND NEW.seller_id <> w.watched_seller THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
      VALUES (w.user_id, 'part_watch_new_seller', 'Yeni satıcı bu parçayı ekledi',
        NEW.title || ' yeni bir satıcı tarafından yayınlandı.', v_link, NEW.id);
      UPDATE public.part_watches SET last_notified_at = now(), notify_count = notify_count + 1 WHERE id = w.id;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

CREATE TRIGGER parts_dispatch_watch_alternatives_trg
  AFTER INSERT ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_part_watch_alternatives();