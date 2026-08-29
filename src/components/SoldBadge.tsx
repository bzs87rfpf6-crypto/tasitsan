// Satılan ürünler listelerde kalır; görselin üzerine sol alttan sağ üste uzanan
// büyük kırmızı yarı saydam (%85) çapraz "SATILDI" şeridi konur.
export function SoldRibbon({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 z-20 pointer-events-none flex items-center justify-center overflow-hidden ${className}`}
      aria-label="Satıldı"
    >
      <div className="absolute inset-0 bg-background/40" />
      <span
        className="relative w-[160%] text-center -rotate-[38deg] bg-destructive/85 text-white font-display font-extrabold uppercase
                   text-sm sm:text-lg md:text-xl tracking-[0.3em] py-1.5 sm:py-2.5 shadow-lg border-y border-white/25 drop-shadow"
      >
        SATILDI
      </span>
    </div>
  );
}

export function SoldPill({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/15 text-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      SATILDI
    </span>
  );
}
