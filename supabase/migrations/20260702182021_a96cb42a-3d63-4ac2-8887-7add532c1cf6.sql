
-- ============================================================
-- GÜVEN MERKEZİ 1.0 — Çekirdek şema
-- ============================================================

-- 1) seller_sales: satıcı-alıcı-ürün eşleşmesi (yorum yetkisi kaynağı)
CREATE TABLE public.seller_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id       uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  note          text,
  confirmed_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, buyer_id, part_id)
);
CREATE INDEX idx_seller_sales_seller ON public.seller_sales(seller_id);
CREATE INDEX idx_seller_sales_buyer  ON public.seller_sales(buyer_id);
CREATE INDEX idx_seller_sales_part   ON public.seller_sales(part_id);

GRANT SELECT, INSERT ON public.seller_sales TO authenticated;
GRANT ALL ON public.seller_sales TO service_role;
ALTER TABLE public.seller_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales visible to seller, buyer and admin" ON public.seller_sales
  FOR SELECT TO authenticated
  USING (auth.uid() = seller_id OR auth.uid() = buyer_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Sellers create sales for their own parts" ON public.seller_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (SELECT 1 FROM public.parts p WHERE p.id = part_id AND p.seller_id = auth.uid())
    AND buyer_id <> seller_id
  );

CREATE POLICY "Admins manage sales" ON public.seller_sales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) seller_reviews
CREATE TABLE public.seller_reviews (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id                uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  sale_id                uuid REFERENCES public.seller_sales(id) ON DELETE SET NULL,
  rating                 smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quality_rating         smallint CHECK (quality_rating BETWEEN 1 AND 5),
  price_rating           smallint CHECK (price_rating BETWEEN 1 AND 5),
  communication_rating   smallint CHECK (communication_rating BETWEEN 1 AND 5),
  shipping_rating        smallint CHECK (shipping_rating BETWEEN 1 AND 5),
  matches_description    boolean,
  recommend              boolean,
  title                  text,
  comment                text,
  images                 text[] NOT NULL DEFAULT '{}',
  verified_purchase      boolean NOT NULL DEFAULT false,
  helpful_count          integer NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','pending')),
  admin_notes            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, part_id)
);
CREATE INDEX idx_reviews_seller  ON public.seller_reviews(seller_id) WHERE status='visible';
CREATE INDEX idx_reviews_part    ON public.seller_reviews(part_id)   WHERE status='visible';
CREATE INDEX idx_reviews_created ON public.seller_reviews(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.seller_reviews TO authenticated;
GRANT SELECT ON public.seller_reviews TO anon;
GRANT ALL ON public.seller_reviews TO service_role;
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read visible reviews" ON public.seller_reviews
  FOR SELECT TO anon, authenticated
  USING (
    status = 'visible'
    OR auth.uid() = buyer_id
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "Verified buyers insert own review" ON public.seller_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND buyer_id <> seller_id
    AND EXISTS (
      SELECT 1 FROM public.seller_sales s
      WHERE s.buyer_id = auth.uid()
        AND s.part_id  = seller_reviews.part_id
        AND s.seller_id = seller_reviews.seller_id
    )
  );

CREATE POLICY "Buyers edit own review" ON public.seller_reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id AND buyer_id <> seller_id);

CREATE POLICY "Admins manage reviews" ON public.seller_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_seller_reviews_updated
  BEFORE UPDATE ON public.seller_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- verified_purchase auto-set on insert
CREATE OR REPLACE FUNCTION public.tg_review_mark_verified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.seller_sales s
    WHERE s.buyer_id = NEW.buyer_id
      AND s.part_id  = NEW.part_id
      AND s.seller_id = NEW.seller_id
  ) THEN
    NEW.verified_purchase := true;
    IF NEW.sale_id IS NULL THEN
      SELECT id INTO NEW.sale_id FROM public.seller_sales s
      WHERE s.buyer_id = NEW.buyer_id AND s.part_id = NEW.part_id AND s.seller_id = NEW.seller_id
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_review_verified BEFORE INSERT ON public.seller_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_review_mark_verified();

-- 3) review_reports
CREATE TABLE public.review_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES public.seller_reviews(id) ON DELETE CASCADE,
  reporter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);
CREATE INDEX idx_review_reports_review ON public.review_reports(review_id);

GRANT SELECT, INSERT ON public.review_reports TO authenticated;
GRANT ALL ON public.review_reports TO service_role;
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users report reviews" ON public.review_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins see reports" ON public.review_reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins update reports" ON public.review_reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) review_helpful (unique per user+review)
CREATE TABLE public.review_helpful (
  review_id  uuid NOT NULL REFERENCES public.seller_reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.review_helpful TO authenticated;
GRANT ALL ON public.review_helpful TO service_role;
ALTER TABLE public.review_helpful ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their helpful votes" ON public.review_helpful
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public read helpful votes" ON public.review_helpful
  FOR SELECT TO anon, authenticated USING (true);

-- keep helpful_count in sync
CREATE OR REPLACE FUNCTION public.tg_review_helpful_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  rid := COALESCE(NEW.review_id, OLD.review_id);
  UPDATE public.seller_reviews
    SET helpful_count = (SELECT count(*) FROM public.review_helpful WHERE review_id = rid)
    WHERE id = rid;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_review_helpful_after
  AFTER INSERT OR DELETE ON public.review_helpful
  FOR EACH ROW EXECUTE FUNCTION public.tg_review_helpful_count();

-- 5) seller_scores
CREATE TABLE public.seller_scores (
  seller_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  average_rating        numeric(3,2) NOT NULL DEFAULT 0,
  review_count          integer NOT NULL DEFAULT 0,
  completed_sales       integer NOT NULL DEFAULT 0,
  recommendation_rate   numeric(5,2) NOT NULL DEFAULT 0,
  response_rate         numeric(5,2) NOT NULL DEFAULT 0,
  response_time_minutes integer NOT NULL DEFAULT 0,
  trust_score           integer NOT NULL DEFAULT 0,
  badge                 text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_scores TO anon, authenticated;
GRANT ALL ON public.seller_scores TO service_role;
ALTER TABLE public.seller_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read seller scores" ON public.seller_scores
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage scores" ON public.seller_scores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6) Recompute function + triggers
CREATE OR REPLACE FUNCTION public.recompute_seller_score(_seller uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_avg        numeric := 0;
  v_count      integer := 0;
  v_sales      integer := 0;
  v_rec_rate   numeric := 0;
  v_verified   boolean := false;
  v_stars_pts  numeric := 0;
  v_sales_pts  numeric := 0;
  v_count_pts  numeric := 0;
  v_verif_pts  numeric := 0;
  v_response_pts numeric := 20; -- response fields default 100% until we track it
  v_trust      integer := 0;
  v_badge      text := NULL;
BEGIN
  SELECT COALESCE(AVG(rating),0), COUNT(*),
         COALESCE( AVG(CASE WHEN recommend THEN 100.0 WHEN recommend IS FALSE THEN 0 ELSE NULL END), 0)
    INTO v_avg, v_count, v_rec_rate
    FROM public.seller_reviews
    WHERE seller_id = _seller AND status='visible';

  SELECT COUNT(*) INTO v_sales FROM public.seller_sales WHERE seller_id = _seller;

  SELECT COALESCE(is_verified,false) INTO v_verified FROM public.profiles WHERE id = _seller;

  -- Weighted score (out of 100)
  v_stars_pts := (v_avg / 5.0) * 35;                                          -- 35%
  v_sales_pts := LEAST(v_sales, 100) / 100.0 * 20;                            -- 20%
  v_count_pts := LEAST(v_count, 50) / 50.0 * 15;                              -- 15%
  v_verif_pts := CASE WHEN v_verified THEN 10 ELSE 0 END;                     -- 10%
  -- response rate/time weight (20%) reserved: default full while un-tracked

  v_trust := ROUND(v_stars_pts + v_sales_pts + v_count_pts + v_verif_pts + v_response_pts);
  IF v_count = 0 AND v_sales = 0 THEN v_trust := 0; END IF;

  v_badge := CASE
    WHEN v_trust >= 95 THEN 'elite'
    WHEN v_trust >= 90 THEN 'gold'
    WHEN v_trust >= 80 THEN 'trusted'
    WHEN v_trust >= 70 THEN 'approved'
    ELSE NULL
  END;

  INSERT INTO public.seller_scores
    (seller_id, average_rating, review_count, completed_sales, recommendation_rate,
     response_rate, response_time_minutes, trust_score, badge, updated_at)
  VALUES
    (_seller, ROUND(v_avg,2), v_count, v_sales, ROUND(v_rec_rate,2),
     100, 0, v_trust, v_badge, now())
  ON CONFLICT (seller_id) DO UPDATE SET
    average_rating      = EXCLUDED.average_rating,
    review_count        = EXCLUDED.review_count,
    completed_sales     = EXCLUDED.completed_sales,
    recommendation_rate = EXCLUDED.recommendation_rate,
    trust_score         = EXCLUDED.trust_score,
    badge               = EXCLUDED.badge,
    updated_at          = now();
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_seller_score(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_reviews_recompute()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_seller_score(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reviews_score_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.seller_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_reviews_recompute();

CREATE OR REPLACE FUNCTION public.tg_sales_recompute()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_seller_score(COALESCE(NEW.seller_id, OLD.seller_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_sales_score_sync
  AFTER INSERT OR DELETE ON public.seller_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_sales_recompute();

-- 7) Storage policy: reuse part-photos bucket for review images under prefix "reviews/<user>/..."
CREATE POLICY "Users upload own review images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'part-photos'
    AND (storage.foldername(name))[1] = 'reviews'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 8) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_scores;

NOTIFY pgrst, 'reload schema';
