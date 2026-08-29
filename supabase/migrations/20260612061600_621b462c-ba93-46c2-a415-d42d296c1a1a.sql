
-- 1) profiles.company_name
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;

-- 2) handle_new_user: capture company_name from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, whatsapp, email, company_name, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'whatsapp',
    NULLIF(NEW.raw_user_meta_data->>'contact_email', ''),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3) Enrich notify_admin_new_user: include company + phone
CREATE OR REPLACE FUNCTION public.notify_admin_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_body text;
BEGIN
  v_body := COALESCE(NEW.display_name, 'İsimsiz');
  IF NEW.company_name IS NOT NULL AND length(NEW.company_name) > 0 THEN
    v_body := v_body || ' · ' || NEW.company_name;
  END IF;
  IF NEW.whatsapp IS NOT NULL AND length(NEW.whatsapp) > 0 THEN
    v_body := v_body || ' · ☎ ' || NEW.whatsapp;
  END IF;
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    'new_user', 'normal',
    '👤 Yeni üye kaydı',
    v_body,
    '/admin?tab=users',
    NEW.id, NEW.id
  );
  RETURN NEW;
END; $$;

-- 4) user_notifications table
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notifications_user_idx
  ON public.user_notifications (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own notifications"
  ON public.user_notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications"
  ON public.user_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own notifications"
  ON public.user_notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname='public' AND tablename='user_notifications';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications';
  END IF;
END $$;

-- 5) Inquiry → notify seller
CREATE OR REPLACE FUNCTION public.notify_seller_new_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seller_id uuid;
  v_part_title text;
BEGIN
  SELECT seller_id, title INTO v_seller_id, v_part_title
    FROM public.parts WHERE id = NEW.part_id;
  IF v_seller_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
  VALUES (
    v_seller_id, 'new_inquiry',
    '💬 Yeni mesaj',
    COALESCE(NEW.full_name,'') || ' ilgileniyor: ' || COALESCE(v_part_title,''),
    '/admin?tab=inquiries',
    NEW.id
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_seller_new_inquiry ON public.inquiries;
CREATE TRIGGER trg_notify_seller_new_inquiry
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.notify_seller_new_inquiry();

-- 6) New quote → notify buyer (request owner)
CREATE OR REPLACE FUNCTION public.notify_buyer_new_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer_id uuid;
  v_part_name text;
BEGIN
  SELECT buyer_id, part_name INTO v_buyer_id, v_part_name
    FROM public.part_requests WHERE id = NEW.request_id;
  IF v_buyer_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.user_notifications (user_id, kind, title, body, link, related_id)
  VALUES (
    v_buyer_id, 'new_quote',
    '💰 Yeni teklif aldın',
    'Talebine teklif: ' || COALESCE(v_part_name,'') || COALESCE(' · ' || NEW.price::text || ' TL', ''),
    '/admin?tab=requests',
    NEW.request_id
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_buyer_new_quote ON public.request_quotes;
CREATE TRIGGER trg_notify_buyer_new_quote
AFTER INSERT ON public.request_quotes
FOR EACH ROW EXECUTE FUNCTION public.notify_buyer_new_quote();

-- 7) XML sync completed → admin bulk_upload notification
CREATE OR REPLACE FUNCTION public.notify_admin_bulk_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_feed_name text;
  v_total int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' THEN RETURN NEW; END IF;
  SELECT name INTO v_feed_name FROM public.xml_feeds WHERE id = NEW.feed_id;
  v_total := COALESCE(NEW.items_inserted,0) + COALESCE(NEW.items_updated,0);
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id)
  VALUES (
    'bulk_upload', 'normal',
    '📦 Toplu ürün yüklendi',
    COALESCE(v_feed_name,'XML') || ' · ' || v_total || ' ürün ('
      || COALESCE(NEW.items_inserted,0) || ' yeni, '
      || COALESCE(NEW.items_updated,0) || ' güncellendi)',
    '/admin?tab=xml',
    NEW.feed_id
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_admin_bulk_upload ON public.xml_sync_runs;
CREATE TRIGGER trg_notify_admin_bulk_upload
AFTER UPDATE ON public.xml_sync_runs
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_bulk_upload();

-- 8) admin_notification_prefs (singleton key/value)
CREATE TABLE IF NOT EXISTS public.admin_notification_prefs (
  id int PRIMARY KEY DEFAULT 1,
  sound_enabled boolean NOT NULL DEFAULT true,
  email_recipients text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_row CHECK (id = 1)
);
INSERT INTO public.admin_notification_prefs (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.admin_notification_prefs TO authenticated;
GRANT ALL ON public.admin_notification_prefs TO service_role;

ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read prefs"
  ON public.admin_notification_prefs FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update prefs"
  ON public.admin_notification_prefs FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
