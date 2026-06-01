
-- 1. is_active on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. site_settings (single-row config)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_rate numeric NOT NULL DEFAULT 5,
  contact_email text,
  contact_phone text,
  contact_address text,
  email_from_name text,
  email_from_address text,
  email_smtp_host text,
  email_smtp_port integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site settings readable by everyone"
ON public.site_settings FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage site settings"
ON public.site_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_site_settings_updated_at
BEFORE UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a single default row if empty
INSERT INTO public.site_settings (commission_rate)
SELECT 5 WHERE NOT EXISTS (SELECT 1 FROM public.site_settings);

-- Allow admins to delete & update profiles (for pasivate/sil)
DROP POLICY IF EXISTS "Admins update any profile" ON public.profiles;
CREATE POLICY "Admins update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete profiles" ON public.profiles;
CREATE POLICY "Admins delete profiles"
ON public.profiles FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
