import { Loader2 } from "lucide-react";

interface ExternalSupplierResultsProps {
  /** OnlineParça / tedarikçi canlı stok sorgusu sürüyor mu? */
  loading: boolean;
  /** Taşıtsan (yerel) sonuç sayısı — bilgilendirme metni için. */
  localResultCount: number;
}

/**
 * OnlineParça ve diğer harici tedarikçilerin canlı stok sorgusu sürerken
 * gösterilen durum kartı. Yerel sonuçları gizlemez; sadece bilgilendirir.
 */
export function ExternalSupplierResults({
  loading,
  localResultCount,
}: ExternalSupplierResultsProps) {
  if (!loading) return null;

  return (
    <div
      className="my-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-6 text-center"
      aria-live="polite"
      role="status"
    >
      <Loader2 className="size-6 text-gold animate-spin" />
      <p className="max-w-md text-[15px] sm:text-lg font-medium text-foreground text-balance break-words">
        Lütfen bekleyin, tüm tedarikçi stokları kontrol ediliyor…
      </p>
      {localResultCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Taşıtsan sonuçları aşağıda; tedarikçi stokları geldikçe listeye eklenecek.
        </p>
      )}
    </div>
  );
}

export default ExternalSupplierResults;
