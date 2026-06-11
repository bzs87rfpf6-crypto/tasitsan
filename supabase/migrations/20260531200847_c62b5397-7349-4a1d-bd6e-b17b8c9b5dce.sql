
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  whatsapp TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, whatsapp)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'whatsapp'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Parts listings
CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  model TEXT,
  year INT,
  category TEXT,
  condition TEXT NOT NULL DEFAULT 'used',
  price NUMERIC(12,2),
  city TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  whatsapp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX parts_created_at_idx ON public.parts (created_at DESC);
CREATE INDEX parts_search_idx ON public.parts USING gin (
  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(model,'') || ' ' || coalesce(description,''))
);

GRANT SELECT ON public.parts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;
GRANT ALL ON public.parts TO service_role;

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parts viewable by everyone"
  ON public.parts FOR SELECT USING (true);
CREATE POLICY "Authenticated users insert parts"
  ON public.parts FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers update own parts"
  ON public.parts FOR UPDATE TO authenticated USING (auth.uid() = seller_id);
CREATE POLICY "Sellers delete own parts"
  ON public.parts FOR DELETE TO authenticated USING (auth.uid() = seller_id);

-- Storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('part-photos', 'part-photos', true);

CREATE POLICY "Part photos public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'part-photos');
CREATE POLICY "Users upload own part photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'part-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own part photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'part-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own part photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'part-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
