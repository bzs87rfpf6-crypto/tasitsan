-- 1) Add trusted_seller column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trusted_seller BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_profiles_trusted_seller ON public.profiles (trusted_seller) WHERE trusted_seller = true;

-- 2) Remove membership approval flow: new signups auto-approved + backfill existing
ALTER TABLE public.profiles ALTER COLUMN is_approved SET DEFAULT true;
UPDATE public.profiles SET is_approved = true WHERE is_approved = false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, whatsapp, email, company_name, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'whatsapp',
    NULLIF(NEW.raw_user_meta_data->>'contact_email', ''),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3) Guard: only admins can change trusted_seller
CREATE OR REPLACE FUNCTION public.guard_trusted_seller_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.trusted_seller IS DISTINCT FROM OLD.trusted_seller THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can modify trusted_seller';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_trusted_seller ON public.profiles;
CREATE TRIGGER trg_guard_trusted_seller
  BEFORE UPDATE OF trusted_seller ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_trusted_seller_update();