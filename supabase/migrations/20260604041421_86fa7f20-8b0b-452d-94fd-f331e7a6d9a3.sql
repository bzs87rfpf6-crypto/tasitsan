CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_secrets TO service_role;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- intentionally no policies for anon/authenticated — only service_role/server can read

INSERT INTO public.app_secrets(key, value) VALUES
  ('vapid_public_key',  'BL6b-UVN1mSjZA2YssJ2iGrijrUzS4uKLbnnJSW_g81ye42GUYFeZ-wH60wuMmKkGP245lPlJqk-4yEyGkKE89o'),
  ('vapid_private_key', '7b9-Kp1j8xzP1oO5GlfKo8KBs2OVYXdaGFwXn9oWWjw'),
  ('vapid_subject',     'mailto:admin@tasitsan.com.tr'),
  ('push_dispatch_secret', encode(gen_random_bytes(32),'hex')),
  ('push_dispatch_url', 'https://project--d82a33fa-37e5-48d9-b071-c90c30694bf1.lovable.app/api/public/push-dispatch')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_vapid_public_key()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT value FROM public.app_secrets WHERE key = 'vapid_public_key' $$;
GRANT EXECUTE ON FUNCTION public.get_vapid_public_key() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_push_for_admin_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  SELECT value INTO v_secret FROM public.app_secrets WHERE key='push_dispatch_secret';
  SELECT value INTO v_url    FROM public.app_secrets WHERE key='push_dispatch_url';
  IF v_secret IS NULL OR v_url IS NULL THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dispatch_push ON public.admin_notifications;
CREATE TRIGGER trg_dispatch_push
AFTER INSERT ON public.admin_notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_admin_notification();