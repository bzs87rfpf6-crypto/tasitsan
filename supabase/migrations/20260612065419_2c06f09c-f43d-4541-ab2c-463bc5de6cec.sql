
-- 1) Extend sync_interval to support finer-grained schedules + manual
ALTER TABLE public.xml_feeds DROP CONSTRAINT IF EXISTS xml_feeds_sync_interval_check;
ALTER TABLE public.xml_feeds ADD CONSTRAINT xml_feeds_sync_interval_check
  CHECK (sync_interval = ANY (ARRAY[
    'manual','15min','30min','1h','hourly','6h','12h','daily','weekly'
  ]));

-- 2) Notify admins when a new XML feed enters the approval queue
CREATE OR REPLACE FUNCTION public.notify_admin_new_xml_feed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller text;
BEGIN
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, company_name, '—')
    INTO v_seller FROM public.profiles WHERE id = NEW.seller_id;
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    'xml_pending', 'normal',
    '📄 Yeni XML beslemesi onay bekliyor',
    COALESCE(v_seller, '—') || ' • ' || NEW.name ||
      CASE WHEN NEW.url IS NOT NULL THEN ' • ' || NEW.url ELSE ' • (dosya)' END,
    '/admin?tab=xml',
    NEW.id, NEW.seller_id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notify_admin_new_xml_feed ON public.xml_feeds;
CREATE TRIGGER tg_notify_admin_new_xml_feed
AFTER INSERT ON public.xml_feeds
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_xml_feed();
