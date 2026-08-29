// Faz 4/4 — Satıcı Güven Rozeti (Doğrulanmış · Puan · Yanıt · Satış · Yorum).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Clock, Star, ShoppingBag, MessageSquare } from "lucide-react";

interface Props {
  sellerId: string;
  compact?: boolean;
}

interface TrustData {
  verified: boolean;
  trust_score: number | null;
  response_minutes: number | null;
  sales_count: number | null;
  avg_rating: number | null;
  review_count: number | null;
}

export function SellerTrustBadge({ sellerId, compact = false }: Props) {
  const [d, setD] = useState<TrustData | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: score }, { data: ver }] = await Promise.all([
        supabase.from("seller_scores").select("trust_score, response_time_minutes, completed_sales, average_rating, review_count").eq("seller_id", sellerId).maybeSingle(),
        supabase.from("seller_verifications").select("status").eq("user_id", sellerId).eq("status", "approved").maybeSingle(),
      ]);
      if (cancelled) return;
      setD({
        verified: !!ver,
        trust_score: score?.trust_score ?? null,
        response_minutes: score?.response_time_minutes ?? null,
        sales_count: score?.completed_sales ?? null,
        avg_rating: score?.average_rating ?? null,
        review_count: score?.review_count ?? null,
      });
    })();
    return () => { cancelled = true };
  }, [sellerId]);

  if (!d) return null;

  const respLabel = d.response_minutes == null ? null
    : d.response_minutes < 60 ? `${d.response_minutes}dk`
    : `${Math.round(d.response_minutes / 60)}sa`;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        {d.verified && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
            <ShieldCheck className="size-3" /> Doğrulanmış
          </span>
        )}
        {d.trust_score != null && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 font-mono">
            {d.trust_score}
          </span>
        )}
        {d.avg_rating != null && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/30">
            <Star className="size-3 fill-current" /> {d.avg_rating.toFixed(1)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className={`size-4 ${d.verified ? "text-emerald-600" : "text-muted-foreground"}`} />
        <span className="text-sm font-semibold">
          {d.verified ? "Doğrulanmış Satıcı" : "Satıcı Bilgileri"}
        </span>
        {d.trust_score != null && (
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
            Güven {d.trust_score}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {respLabel && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" /> <span>Ort. yanıt:</span> <b className="text-foreground">{respLabel}</b>
          </div>
        )}
        {d.avg_rating != null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Star className="size-3.5 text-amber-500" /> <span>Puan:</span>
            <b className="text-foreground">{d.avg_rating.toFixed(1)}/5</b>
            {d.review_count != null && <span className="text-muted-foreground">({d.review_count})</span>}
          </div>
        )}
        {d.sales_count != null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShoppingBag className="size-3.5" /> <span>Satış:</span> <b className="text-foreground">{d.sales_count}</b>
          </div>
        )}
        {d.review_count != null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="size-3.5" /> <span>Yorum:</span> <b className="text-foreground">{d.review_count}</b>
          </div>
        )}
      </div>
    </div>
  );
}
