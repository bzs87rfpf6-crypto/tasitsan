
CREATE OR REPLACE FUNCTION public.notify_admin_bulk_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_feed_name text;
  v_total int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' THEN RETURN NEW; END IF;
  SELECT name INTO v_feed_name FROM public.xml_feeds WHERE id = NEW.feed_id;
  v_total := COALESCE(NEW.items_added,0) + COALESCE(NEW.items_updated,0);
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id)
  VALUES (
    'bulk_upload', 'normal',
    '📦 Toplu ürün yüklendi',
    COALESCE(v_feed_name,'XML') || ' · ' || v_total || ' ürün ('
      || COALESCE(NEW.items_added,0) || ' yeni, '
      || COALESCE(NEW.items_updated,0) || ' güncellendi)',
    '/admin?tab=xml',
    NEW.feed_id
  );
  RETURN NEW;
END; $$;
