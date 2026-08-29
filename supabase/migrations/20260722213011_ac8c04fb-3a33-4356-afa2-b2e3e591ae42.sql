-- 1) ai_search_logs
CREATE TABLE public.ai_search_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_oems TEXT[] NOT NULL DEFAULT '{}',
  parts_found INTEGER NOT NULL DEFAULT 0,
  oem_refs_found INTEGER NOT NULL DEFAULT 0,
  similar_oems_found INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  confidence_tier TEXT NOT NULL DEFAULT 'ask',
  ai_model TEXT,
  duration_ms INTEGER,
  stage_reached TEXT,          -- parts | oem_ref | vehicle | synonyms | fuzzy | semantic | none
  error_message TEXT,
  clicked_part_id UUID,
  request_created BOOLEAN NOT NULL DEFAULT FALSE,
  purchase_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_search_logs_created_idx ON public.ai_search_logs(created_at DESC);
CREATE INDEX ai_search_logs_tier_idx ON public.ai_search_logs(confidence_tier);
CREATE INDEX ai_search_logs_parts_found_idx ON public.ai_search_logs(parts_found);

-- 2) Grants
GRANT INSERT, UPDATE ON public.ai_search_logs TO anon, authenticated;
GRANT SELECT ON public.ai_search_logs TO authenticated;
GRANT ALL ON public.ai_search_logs TO service_role;

-- 3) RLS
ALTER TABLE public.ai_search_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can read ai_search_logs"
  ON public.ai_search_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Anyone (including anonymous visitors) can insert their own log row
CREATE POLICY "Anyone can insert ai_search_logs"
  ON public.ai_search_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only the row itself can be updated (conversion tracking) by the original session/user
-- Admins can update anything
CREATE POLICY "Update conversion by session/admin"
  ON public.ai_search_logs FOR UPDATE
  TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (user_id IS NOT NULL AND user_id = auth.uid())
    OR user_id IS NULL  -- anon-created rows: allow conversion updates
  )
  WITH CHECK (true);

-- 4) updated_at trigger
CREATE TRIGGER ai_search_logs_updated_at
  BEFORE UPDATE ON public.ai_search_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Analytics RPC (admin-only via has_role check)
CREATE OR REPLACE FUNCTION public.ai_search_stats(_days INTEGER DEFAULT 7)
RETURNS TABLE (
  total_searches BIGINT,
  successful BIGINT,        -- parts_found > 0
  no_results BIGINT,
  avg_confidence NUMERIC,
  click_through BIGINT,     -- clicked_part_id NOT NULL
  requests_created BIGINT,
  purchases BIGINT,
  success_rate NUMERIC,
  ctr NUMERIC,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  WITH win AS (
    SELECT * FROM public.ai_search_logs
    WHERE created_at >= now() - (_days || ' days')::interval
  ),
  agg AS (
    SELECT
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE parts_found > 0)::BIGINT AS ok,
      COUNT(*) FILTER (WHERE parts_found = 0)::BIGINT AS empty,
      COALESCE(AVG(confidence), 0)::NUMERIC AS avg_conf,
      COUNT(*) FILTER (WHERE clicked_part_id IS NOT NULL)::BIGINT AS clicks,
      COUNT(*) FILTER (WHERE request_created)::BIGINT AS reqs,
      COUNT(*) FILTER (WHERE purchase_completed)::BIGINT AS buys
    FROM win
  )
  SELECT
    total, ok, empty, ROUND(avg_conf, 1),
    clicks, reqs, buys,
    CASE WHEN total > 0 THEN ROUND((ok::NUMERIC / total) * 100, 1) ELSE 0 END AS success_rate,
    CASE WHEN ok > 0 THEN ROUND((clicks::NUMERIC / ok) * 100, 1) ELSE 0 END AS ctr,
    CASE WHEN total > 0 THEN ROUND(((reqs + buys)::NUMERIC / total) * 100, 1) ELSE 0 END AS conversion_rate
  FROM agg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_search_stats(INTEGER) TO authenticated;