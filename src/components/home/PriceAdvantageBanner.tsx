import { BadgePercent, ShieldCheck, Sparkles } from "lucide-react";

export function PriceAdvantageBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-gold/60 bg-gradient-to-br from-gold/20 via-background to-background shadow-gold">
      <div className="absolute -top-8 -right-8 size-40 rounded-full bg-gold/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 size-40 rounded-full bg-gold/15 blur-3xl pointer-events-none" />
      <div className="relative flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
        <div className="hidden sm:grid size-14 rounded-2xl bg-gold-gradient text-gold-foreground place-items-center shrink-0 shadow-gold">
          <BadgePercent className="size-7" strokeWidth={2.4} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base sm:text-xl leading-tight tracking-wide text-foreground">
            <span className="mr-1.5">💰</span>
            Aynı parçayı piyasadan{" "}
            <span className="text-gold font-bold">%20–50 daha uygun</span> fiyata bulun.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Sparkles className="size-3 text-gold" /> 14.000+ ilan</span>
            <span className="opacity-40">•</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3 text-gold" /> Gerçek satıcılar</span>
            <span className="opacity-40">•</span>
            <span>Güncel stoklar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
