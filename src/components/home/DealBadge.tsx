// Tek fiyat rozeti: Taşıtsan'ın ana mesajı her üründe aynı — Uygun Fiyatlı Yedek Parça.
export function DealBadge() {
  return (
    <span className="absolute z-10 top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 shadow-lg border border-white/20 pointer-events-none">
      <span aria-hidden>💰</span>
      UYGUN FİYAT
    </span>
  );
}
