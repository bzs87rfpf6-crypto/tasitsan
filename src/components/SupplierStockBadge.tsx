import { Truck, Info, PackageSearch } from "lucide-react";
import {
  SINGLE_SHIPMENT_MIN,
  canShipAlone,
  isSupplierStock,
  minOrderAmount,
  money,
  procurementLabel,
  type SupplierFields,
} from "@/lib/supplier-stock";

/** Ürün kartlarında gösterilen "Tedarikçi Stoğu" rozeti. */
export function SupplierStockBadge({
  part,
  className = "",
}: {
  part: SupplierFields | null | undefined;
  className?: string;
}) {
  if (!isSupplierStock(part)) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-gold/50 bg-background/85 text-gold ${className}`}
    >
      <PackageSearch className="size-3" /> Tedarikçi Stoğu
    </span>
  );
}

/** Ürün detay sayfasındaki bilgilendirme kartı. */
export function SupplierStockNotice({
  part,
  className = "",
}: {
  part: (SupplierFields & { price?: number | null }) | null | undefined;
  className?: string;
}) {
  if (!isSupplierStock(part)) return null;
  const alone = canShipAlone(part);
  const eta = procurementLabel(part);
  const min = minOrderAmount(part);

  return (
    <section
      className={`rounded-xl border border-gold/40 bg-gold/5 p-3.5 space-y-2 ${className}`}
      aria-label="Tedarikçi stoğu bilgisi"
    >
      <h2 className="flex items-center gap-2 text-sm font-display tracking-wide text-gold">
        <Info className="size-4" /> Bu ürün Taşıtsan deposunda değildir.
      </h2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Tedarikçi / servis stoğundan temin edilir. Sipariş onayından sonra tedarik süreci başlar.
      </p>
      <ul className="space-y-1.5 text-xs">
        {eta && (
          <li className="flex items-start gap-2">
            <Truck className="size-3.5 text-gold mt-0.5 shrink-0" />
            <span>{eta}</span>
          </li>
        )}
        {!alone && (
          <li className="flex items-start gap-2">
            <PackageSearch className="size-3.5 text-gold mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold text-gold">Tek Başına Gönderilemez.</span>{" "}
              {money(SINGLE_SHIPMENT_MIN)} altındaki bu ürün için aynı satıcıdan alınan ürünlerin toplamı{" "}
              <span className="font-semibold">{money(min)}</span> olmalıdır.
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
