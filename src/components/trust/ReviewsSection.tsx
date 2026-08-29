import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, ThumbsUp, Flag, Star as StarIcon } from "lucide-react";
import { StarRating } from "./StarRating";
import { ReviewForm } from "./ReviewForm";
import { useAuth } from "@/hooks/use-auth";
import {
  getPartReviews,
  canReviewPart,
  toggleHelpful,
  reportReview,
} from "@/lib/trust.functions";
import { supabase } from "@/integrations/supabase/client";

type Sort = "helpful" | "newest" | "highest" | "photos";

interface Props {
  partId: string;
  sellerId: string;
  partParam?: string;
}

interface Review {
  id: string;
  rating: number;
  quality_rating: number | null;
  price_rating: number | null;
  communication_rating: number | null;
  shipping_rating: number | null;
  title: string | null;
  comment: string | null;
  images: string[] | null;
  recommend: boolean | null;
  matches_description: boolean | null;
  verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
  buyer_id: string;
}

export function ReviewsSection({ partId, sellerId, partParam }: Props) {
  const { user } = useAuth();
  const load = useServerFn(getPartReviews);
  const check = useServerFn(canReviewPart);
  const helpfulFn = useServerFn(toggleHelpful);
  const reportFn = useServerFn(reportReview);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>("helpful");
  const [showForm, setShowForm] = useState(false);
  const [gate, setGate] = useState<{
    canReview: boolean;
    reason: string;
    existingReviewId?: string | null;
  } | null>(null);
  const [buyerNames, setBuyerNames] = useState<Record<string, string>>({});

  async function refresh() {
    setLoading(true);
    try {
      const { reviews } = await load({ data: { partId } });
      const list = reviews as unknown as Review[];
      setReviews(list);
      const ids = Array.from(new Set(list.map((r) => r.buyer_id)));
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id,display_name").in("id", ids);
        const map: Record<string, string> = {};
        (data ?? []).forEach((p: any) => { map[p.id] = p.display_name ?? "Kullanıcı"; });
        setBuyerNames(map);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [partId]);

  useEffect(() => {
    if (!user) { setGate(null); return; }
    check({ data: { partId } }).then((g) => setGate(g as any)).catch(() => setGate(null));
  }, [user, partId, check]);

  const sorted = useMemo(() => {
    const arr = [...reviews];
    if (sort === "newest") arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    else if (sort === "highest") arr.sort((a, b) => b.rating - a.rating);
    else if (sort === "photos") arr.sort((a, b) => (b.images?.length ?? 0) - (a.images?.length ?? 0));
    else arr.sort((a, b) => b.helpful_count - a.helpful_count || +new Date(b.created_at) - +new Date(a.created_at));
    return arr;
  }, [reviews, sort]);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const recommendPct = reviews.length
    ? Math.round((reviews.filter((r) => r.recommend === true).length / Math.max(1, reviews.filter((r) => r.recommend != null).length)) * 100)
    : null;

  async function onHelpful(id: string) {
    if (!user) { toast.info("Faydalı oyu için giriş yapın"); return; }
    try {
      await helpfulFn({ data: { reviewId: id } });
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }
  async function onReport(id: string) {
    if (!user) { toast.info("Şikayet için giriş yapın"); return; }
    const reason = prompt("Şikayet sebebiniz?");
    if (!reason) return;
    try {
      await reportFn({ data: { reviewId: id, reason } });
      toast.success("Şikayetiniz alındı");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <section className="bg-card rounded-xl border border-border p-4 space-y-4" aria-label="Ürün yorumları">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display tracking-wide text-base flex items-center gap-2">
            <StarIcon className="size-4 text-gold" /> Yorumlar
          </h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <StarRating value={avg} size={14} />
            <span>{avg.toFixed(1)} • {reviews.length} yorum</span>
            {recommendPct !== null && (
              <span className="text-gold">• %{recommendPct} tavsiye</span>
            )}
          </div>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-8 px-2 rounded-md bg-background border border-border text-[11px] font-semibold"
        >
          <option value="helpful">En faydalı</option>
          <option value="newest">En yeni</option>
          <option value="highest">En yüksek puan</option>
          <option value="photos">Fotoğraflı</option>
        </select>
      </header>

      {recommendPct !== null && recommendPct >= 60 && (
        <p className="text-xs text-emerald-300 bg-emerald-400/5 border border-emerald-400/20 rounded-lg px-3 py-2">
          Bu satıcıyı <span className="font-semibold">%{recommendPct}</span> oranında kullanıcılar tekrar tercih ediyor.
        </p>
      )}

      {/* Write review CTA */}
      {user ? (
        gate?.canReview ? (
          showForm ? (
            <ReviewForm
              partId={partId}
              sellerId={sellerId}
              onSaved={() => { setShowForm(false); refresh(); }}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button onClick={() => setShowForm(true)}
              className="w-full h-11 rounded-lg bg-gold-gradient text-gold-foreground text-sm font-semibold shadow-gold">
              ⭐ Yorum Yaz
            </button>
          )
        ) : gate?.reason === "already" ? (
          <p className="text-[11px] text-muted-foreground text-center">Bu ürün için zaten yorum yaptınız.</p>
        ) : gate?.reason === "not_verified" ? (
          <p className="text-[11px] text-muted-foreground text-center bg-muted/30 rounded-lg p-2">
            Yorum yazabilmek için satıcının siparişinizi tamamlandı olarak onaylaması gerekir.
          </p>
        ) : null
      ) : (
        <Link to="/auth" search={{ redirect: `/parts/${partParam ?? partId}` } as any}
          rel="nofollow"
          className="block text-center text-[12px] text-gold font-semibold border border-gold/40 rounded-lg py-2">
          Yorum yazmak için giriş yapın
        </Link>

      )}

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-6">Yükleniyor…</p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Henüz yorum yok. İlk yorum senin olsun.</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => (
            <li key={r.id} className="border border-border rounded-lg p-3 space-y-2 bg-background/40">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StarRating value={r.rating} size={14} />
                  <span className="text-xs font-semibold truncate">{buyerNames[r.buyer_id] ?? "Kullanıcı"}</span>
                  {r.verified_purchase && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-sky-400 font-semibold">
                      <BadgeCheck className="size-3" /> Doğrulanmış Alıcı
                    </span>
                  )}
                </div>
                <time className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(r.created_at).toLocaleDateString("tr-TR")}
                </time>
              </div>
              {r.title && <p className="text-sm font-semibold">{r.title}</p>}
              {r.comment && <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{r.comment}</p>}
              {!!r.images?.length && (
                <div className="flex gap-1.5 flex-wrap">
                  {r.images.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="size-14 rounded overflow-hidden border border-border">
                      <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              <SubScores r={r} />
              <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                <button onClick={() => onHelpful(r.id)} className="inline-flex items-center gap-1 hover:text-gold">
                  <ThumbsUp className="size-3" /> Faydalı ({r.helpful_count})
                </button>
                <button onClick={() => onReport(r.id)} className="inline-flex items-center gap-1 hover:text-destructive">
                  <Flag className="size-3" /> Şikayet
                </button>
                {r.recommend === true && <span className="text-emerald-400">✓ Tavsiye ediyor</span>}
                {r.recommend === false && <span className="text-destructive">✗ Tavsiye etmiyor</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SubScores({ r }: { r: Review }) {
  const items = [
    { l: "Kalite", v: r.quality_rating },
    { l: "Fiyat", v: r.price_rating },
    { l: "İletişim", v: r.communication_rating },
    { l: "Kargo", v: r.shipping_rating },
  ].filter((x) => x.v != null);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5">
          {i.l}: <span className="text-gold font-semibold">{i.v}/5</span>
        </span>
      ))}
      {r.matches_description === true && <span className="rounded bg-emerald-400/10 text-emerald-300 px-1.5 py-0.5">Açıklamaya uygun</span>}
      {r.matches_description === false && <span className="rounded bg-destructive/10 text-destructive px-1.5 py-0.5">Açıklamaya uymadı</span>}
    </div>
  );
}
