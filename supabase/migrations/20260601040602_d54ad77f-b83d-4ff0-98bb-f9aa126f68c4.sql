
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Inquiries
CREATE TABLE public.inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_inquiries_status ON public.inquiries(status);
CREATE INDEX idx_inquiries_part ON public.inquiries(part_id);
CREATE INDEX idx_inquiries_buyer ON public.inquiries(buyer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT ALL ON public.inquiries TO service_role;

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users create inquiries" ON public.inquiries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Buyers see own inquiries" ON public.inquiries
  FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update inquiries" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete inquiries" ON public.inquiries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto update timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_inquiries_updated
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
