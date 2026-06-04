
-- 1) Notifications table
CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('new_user','new_listing','urgent_request','new_quote')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  title text NOT NULL,
  body text,
  link text,
  related_id uuid,
  actor_user_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_notifications_created_idx ON public.admin_notifications (created_at DESC);
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications (read_at) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all notifications"
  ON public.admin_notifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can mark read"
  ON public.admin_notifications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Realtime
ALTER TABLE public.admin_notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- 3) Triggers

-- New user: fires when a profile is created (via handle_new_user)
CREATE OR REPLACE FUNCTION public.notify_admin_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    'new_user', 'normal',
    'Yeni üye kaydı',
    COALESCE(NEW.display_name, 'İsimsiz') || ' kayıt oldu',
    '/admin',
    NEW.id, NEW.id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_admin_new_user
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_user();

-- New listing
CREATE OR REPLACE FUNCTION public.notify_admin_new_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    'new_listing', 'normal',
    'Yeni ilan',
    COALESCE(NEW.title, 'İsimsiz parça'),
    '/parts/' || NEW.id::text,
    NEW.id, NEW.seller_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_admin_new_listing
AFTER INSERT ON public.parts
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_listing();

-- Urgent request
CREATE OR REPLACE FUNCTION public.notify_admin_urgent_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_urgent = true THEN
    INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
    VALUES (
      'urgent_request', 'high',
      '🚨 ACİL Parça Talebi',
      COALESCE(NEW.part_name, '') || ' - ' || COALESCE(NEW.brand,'') || ' ' || COALESCE(NEW.model,''),
      '/admin',
      NEW.id, NEW.buyer_id
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_admin_urgent_request
AFTER INSERT ON public.part_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_urgent_request();

-- New quote (Bende Var)
CREATE OR REPLACE FUNCTION public.notify_admin_new_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_part_name text;
  v_is_urgent boolean;
BEGIN
  SELECT part_name, is_urgent INTO v_part_name, v_is_urgent
    FROM public.part_requests WHERE id = NEW.request_id;
  INSERT INTO public.admin_notifications (kind, priority, title, body, link, related_id, actor_user_id)
  VALUES (
    'new_quote',
    CASE WHEN v_is_urgent THEN 'high' ELSE 'normal' END,
    'Yeni teklif (Bende Var)',
    'Talep: ' || COALESCE(v_part_name, '-') || ' • Fiyat: ' || COALESCE(NEW.price::text, '-'),
    '/admin',
    NEW.request_id, NEW.seller_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_admin_new_quote
AFTER INSERT ON public.request_quotes
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_quote();
