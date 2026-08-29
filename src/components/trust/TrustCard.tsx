import { StarRating } from "./StarRating";
import { TrustBadgePill } from "./TrustBadge";
import { trustLevelLabel, type SellerScore } from "@/lib/trust";
import { ShieldCheck, MessageSquare, Package, ThumbsUp, Clock } from "lucide-react";

interface Props {
  score: SellerScore | null;
  compact?: boolean;
}

export function TrustCard({ score, compact = false }: Props) {
  const trust = score?.trust_score ?? 0;
  const level = trustLevelLabel(trust);
  const avg = score?.average_rating ?? 0;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-card via-card to-gold/5 p-5 shadow-gold/30"
      aria-label="Güven Merkezi"
    >
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-gold" />
          <h2 className="font-display text-sm tracking-wider uppercase text-gold">Güven Merkezi</h2>
        </div>
        {score?.badge && <TrustBadgePill badge={score.badge} size="md" />}
      </header>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <div className="font-display text-5xl leading-none tracking-tight text-foreground">
            {trust}
            <span className="text-lg text-muted-foreground">/100</span>
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {level} güven seviyesi
          </p>
        </div>
        <div className="flex flex-col items-end">
          <StarRating value={avg} size={18} />
          <p className="text-[11px] text-muted-foreground mt-1">
            {avg.toFixed(1)} • {score?.review_count ?? 0} yorum
          </p>
        </div>
      </div>

      {!compact && (
        <dl className="mt-5 grid grid-cols-2 gap-2">
          <Stat icon={<Package className="size-3.5" />} label="Başarılı Satış" value={String(score?.completed_sales ?? 0)} />
          <Stat icon={<ThumbsUp className="size-3.5" />} label="Tavsiye Oranı" value={`%${Math.round(score?.recommendation_rate ?? 0)}`} />
          <Stat icon={<MessageSquare className="size-3.5" />} label="Yanıt Oranı" value={`%${Math.round(score?.response_rate ?? 100)}`} />
          <Stat icon={<Clock className="size-3.5" />} label="Aktif" value={score ? new Date(score.updated_at).toLocaleDateString("tr-TR") : "—"} />
        </dl>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Güven puanı; doğrulanmış yorumlar, tamamlanmış satışlar ve satıcı doğrulaması esas alınarak
        <span className="text-gold"> otomatik</span> hesaplanır.
      </p>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-gold">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
