
-- Part views table for tracking views with deduplication
CREATE TABLE public.part_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  viewer_key text NOT NULL,
  view_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id, viewer_key, view_date)
);

CREATE INDEX idx_part_views_part_id ON public.part_views(part_id);
CREATE INDEX idx_part_views_created_at ON public.part_views(created_at DESC);

GRANT SELECT ON public.part_views TO anon, authenticated;
GRANT ALL ON public.part_views TO service_role;

ALTER TABLE public.part_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view part views"
  ON public.part_views FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage part views"
  ON public.part_views FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RPC to record a view safely (handles dedup via unique constraint)
CREATE OR REPLACE FUNCTION public.record_part_view(_part_id uuid, _viewer_key text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  -- Validate viewer_key length to filter obvious junk / bots
  IF _viewer_key IS NULL OR length(_viewer_key) < 8 OR length(_viewer_key) > 200 THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;

  -- Verify part exists & is approved (don't count views on unpublished items)
  IF NOT EXISTS (SELECT 1 FROM public.parts WHERE id = _part_id AND status = 'approved') THEN
    SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
    RETURN v_count;
  END IF;

  INSERT INTO public.part_views (part_id, viewer_key)
  VALUES (_part_id, _viewer_key)
  ON CONFLICT (part_id, viewer_key, view_date) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.part_views WHERE part_id = _part_id;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_part_view(uuid, text) TO anon, authenticated;

-- Favorites table
CREATE TABLE public.favorites (
  user_id uuid NOT NULL,
  part_id uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, part_id)
);

CREATE INDEX idx_favorites_part_id ON public.favorites(part_id);
CREATE INDEX idx_favorites_user_id ON public.favorites(user_id);

GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own favorites"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read favorite counts"
  ON public.favorites FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Users insert own favorites"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own favorites"
  ON public.favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all favorites"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
