CREATE OR REPLACE FUNCTION public.notify_admin_new_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Harici tedarikçi kayıtları (OnlineParça vb.) gerçek bir kullanıcı ilanı
  -- değildir; yönetici "Yeni ilan" bildirimlerine düşmemelidir.
  IF NEW.source_type IS DISTINCT FROM 'own_stock' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    'new_listing', 'normal',
    'Yeni ilan',
    COALESCE(NEW.title, 'İsimsiz parça'),
    '/parts/' || NEW.id::text,
    NEW.id, NEW.seller_id
  );
  RETURN NEW;
END;
$$;