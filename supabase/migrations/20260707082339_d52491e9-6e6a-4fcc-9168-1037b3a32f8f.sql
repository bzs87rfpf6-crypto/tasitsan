
CREATE TABLE public.featured_deals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  featured_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT featured_deals_part_unique UNIQUE (part_id)
);

CREATE INDEX featured_deals_sort_idx ON public.featured_deals (is_active, sort_order);
CREATE INDEX featured_deals_part_idx ON public.featured_deals (part_id);

GRANT SELECT ON public.featured_deals TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.featured_deals TO authenticated;
GRANT ALL ON public.featured_deals TO service_role;

ALTER TABLE public.featured_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Featured deals are viewable by everyone"
  ON public.featured_deals FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert featured deals"
  ON public.featured_deals FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update featured deals"
  ON public.featured_deals FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete featured deals"
  ON public.featured_deals FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
