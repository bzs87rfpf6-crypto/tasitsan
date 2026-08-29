import { PackageSearch, ArrowRight, Wrench, ShieldCheck, Clock } from "lucide-react";

/** Ana sayfa üstünde dikkat çeken talep oluşturma bandı. */
export function HomeRequestCta({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      aria-label="Parça talebi oluştur"
      className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gold-gradient p-5 sm:p-7 shadow-gold"
    >
      <Wrench
        aria-hidden
        className="pointer-events-none absolute -right-6 -bottom-8 size-44 sm:size-56 rotate-12 text-gold-foreground/10"
      />
      <div className="relative grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h2 className="font-display text-2xl sm:text-[32px] font-bold leading-tight tracking-wide text-gold-foreground">
            Aradığınız Parça Yok mu?
          </h2>
          <p className="mt-1.5 text-sm sm:text-base font-medium leading-relaxed text-gold-foreground/80">
            Talep oluşturun, satıcılar size teklif göndersin.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs sm:text-sm font-semibold text-gold-foreground/85">
            <li className="inline-flex items-center gap-1.5"><PackageSearch className="size-4" /> Binlerce satıcıya tek talep</li>
            <li className="inline-flex items-center gap-1.5"><Clock className="size-4" /> Dakikalar içinde teklif</li>
            <li className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" /> Ücretsiz ve güvenli</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="tap-gold inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-card px-7 py-4 text-base font-bold text-foreground shadow-card hover:bg-card/90"
        >
          Talep Oluştur <ArrowRight className="size-5" />
        </button>
      </div>
    </section>
  );
}
