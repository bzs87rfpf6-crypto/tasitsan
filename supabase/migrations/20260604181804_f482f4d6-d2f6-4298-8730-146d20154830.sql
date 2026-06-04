
-- part_alerts table
CREATE TABLE public.part_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword text,
  brand text,
  model text,
  oem_code text,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  last_matched_at timestamptz,
  match_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_alerts_min_filter CHECK (
    coalesce(trim(keyword),'') <> '' OR
    coalesce(trim(oem_code),'') <> '' OR
    coalesce(trim(brand),'') <> '' OR
    coalesce(trim(model),'') <> ''
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_alerts TO authenticated;
GRANT ALL ON public.part_alerts TO service_role;

ALTER TABLE public.part_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts" ON public.part_alerts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX part_alerts_user_idx ON public.part_alerts(user_id) WHERE is_active;
CREATE INDEX part_alerts_active_idx ON public.part_alerts(is_active) WHERE is_active;

-- normalize on write
CREATE OR REPLACE FUNCTION public.part_alerts_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.keyword IS NOT NULL THEN NEW.keyword := nullif(trim(NEW.keyword),''); END IF;
  IF NEW.brand   IS NOT NULL THEN NEW.brand   := nullif(trim(NEW.brand),''); END IF;
  IF NEW.model   IS NOT NULL THEN NEW.model   := nullif(trim(NEW.model),''); END IF;
  IF NEW.category IS NOT NULL THEN NEW.category := nullif(trim(NEW.category),''); END IF;
  IF NEW.oem_code IS NOT NULL THEN
    NEW.oem_code := nullif(upper(trim(NEW.oem_code)),'');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER part_alerts_normalize_trg
  BEFORE INSERT OR UPDATE ON public.part_alerts
  FOR EACH ROW EXECUTE FUNCTION public.part_alerts_normalize();

-- dispatch trigger on parts: when a part becomes approved, ping the alert-dispatch endpoint
CREATE OR REPLACE FUNCTION public.dispatch_alerts_for_part()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
  v_url    text;
  v_should boolean := false;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    v_should := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    v_should := true;
  END IF;
  IF NOT v_should THEN RETURN NEW; END IF;

  SELECT value INTO v_secret FROM public.app_secrets WHERE key='push_dispatch_secret';
  SELECT value INTO v_url    FROM public.app_secrets WHERE key='alert_dispatch_url';
  IF v_secret IS NULL OR v_url IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    body := jsonb_build_object('part_id', NEW.id)
  );
  RETURN NEW;
END $$;

CREATE TRIGGER parts_dispatch_alerts
  AFTER INSERT OR UPDATE OF status ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_alerts_for_part();

-- seed the dispatch URL (same host as push_dispatch_url)
INSERT INTO public.app_secrets(key, value)
VALUES ('alert_dispatch_url', 'https://project--d82a33fa-37e5-48d9-b071-c90c30694bf1.lovable.app/api/public/alert-dispatch')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
