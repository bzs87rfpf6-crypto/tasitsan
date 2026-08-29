
-- USER VEHICLES
CREATE TABLE IF NOT EXISTS public.user_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  engine text,
  fuel text,
  transmission text,
  variant text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_vehicles_user ON public.user_vehicles(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_vehicles TO authenticated;
GRANT ALL ON public.user_vehicles TO service_role;

ALTER TABLE public.user_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicles_owner_select" ON public.user_vehicles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vehicles_owner_insert" ON public.user_vehicles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vehicles_owner_update" ON public.user_vehicles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vehicles_owner_delete" ON public.user_vehicles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_default_vehicle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.user_vehicles SET is_default = false
    WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_vehicle ON public.user_vehicles;
CREATE TRIGGER trg_set_default_vehicle
BEFORE INSERT OR UPDATE ON public.user_vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_default_vehicle();

-- AI SEARCH LOGS: favorites / soft delete / used vehicle
ALTER TABLE public.ai_search_logs
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.user_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clarification_shown boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_search_logs_user_recent ON public.ai_search_logs(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_search_logs_favorite ON public.ai_search_logs(user_id, is_favorite) WHERE is_favorite = true AND deleted_at IS NULL;
