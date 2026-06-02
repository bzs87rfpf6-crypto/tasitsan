CREATE TABLE IF NOT EXISTS public.bot_filter_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bot_filter_rules_pattern_chk CHECK (length(pattern) BETWEEN 1 AND 200),
  CONSTRAINT bot_filter_rules_pattern_unique UNIQUE (pattern)
);

GRANT SELECT ON public.bot_filter_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bot_filter_rules TO authenticated;
GRANT ALL ON public.bot_filter_rules TO service_role;

ALTER TABLE public.bot_filter_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads enabled bot rules"
  ON public.bot_filter_rules FOR SELECT
  TO anon, authenticated
  USING (enabled = true);

CREATE POLICY "Admins read all bot rules"
  ON public.bot_filter_rules FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert bot rules"
  ON public.bot_filter_rules FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update bot rules"
  ON public.bot_filter_rules FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete non-default bot rules"
  ON public.bot_filter_rules FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND is_default = false);

CREATE TRIGGER bot_filter_rules_set_updated_at
  BEFORE UPDATE ON public.bot_filter_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.bot_filter_rules (pattern, label, is_default) VALUES
  ('googlebot', 'Googlebot', true),
  ('bingbot', 'Bingbot', true),
  ('yandex', 'Yandex', true),
  ('baidu', 'Baidu', true),
  ('duckduckbot', 'DuckDuckGo', true),
  ('applebot', 'Applebot', true),
  ('facebookexternalhit', 'Facebook', true),
  ('whatsapp', 'WhatsApp önizleme', true),
  ('telegram', 'Telegram önizleme', true),
  ('twitterbot', 'Twitter', true),
  ('linkedinbot', 'LinkedIn', true),
  ('slackbot', 'Slack', true),
  ('semrush', 'Semrush', true),
  ('ahrefs', 'Ahrefs', true),
  ('mj12', 'Majestic', true),
  ('dotbot', 'DotBot', true),
  ('petalbot', 'Petalbot', true),
  ('bot', 'Genel "bot" eşleşmesi', true),
  ('crawl', 'Genel "crawl"', true),
  ('spider', 'Genel "spider"', true),
  ('slurp', 'Yahoo Slurp', true),
  ('headless', 'Headless tarayıcı', true),
  ('lighthouse', 'Lighthouse', true),
  ('pagespeed', 'PageSpeed', true),
  ('gtmetrix', 'GTmetrix', true),
  ('pingdom', 'Pingdom', true),
  ('uptimerobot', 'UptimeRobot', true),
  ('puppeteer', 'Puppeteer', true),
  ('selenium', 'Selenium', true),
  ('phantom', 'PhantomJS', true)
ON CONFLICT (pattern) DO NOTHING;