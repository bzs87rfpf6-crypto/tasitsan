import { Link } from "@tanstack/react-router";
import { buildPartParam } from "@/lib/part-slug";
import { displayOem } from "@/lib/oem-display";
import { MapPin, Package } from "lucide-react";
import { SafePartImage } from "@/components/SafePartImage";
import { FavoriteButton } from "@/components/FavoriteButton";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { TrustedSellerBadge } from "@/components/TrustedSellerBadge";
import { PartTypeBadge } from "@/components/PartTypeBadge";
import { NewBadge } from "@/components/NewBadge";
import { DeliveryBadges } from "@/components/DeliveryBadges";
import { AddToCartButton } from "@/components/AddToCartButton";
import { SoldRibbon } from "@/components/SoldBadge";
import { SoldActions } from "@/components/SoldActions";
import { SupplierStockBadge } from "@/components/SupplierStockBadge";

export interface Part {
  id: string;
  seo_slug?: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  city: string | null;
  photos: string[] | null;
  condition: string;
  part_type?: string | null;
  stock_quantity?: number | null;
  /** Stok doğrulanamadığında müşteriye gösterilecek metin (ör. "Lütfen stok sorunuz"). */
  stock_label?: string | null;

  oem_code?: string | null;
  oem_codes?: string[] | null;
  seller_verified?: boolean;
  seller_trusted?: boolean;
  created_at?: string | null;
  delivery_options?: string[] | null;
  urgent_delivery?: boolean | null;
  seller_id?: string | null;
  is_sold?: boolean | null;
  supplier_stock?: boolean | null;
  minimum_order_amount?: number | null;
  single_shipment_allowed?: boolean | null;
  procurement_days?: number | null;
  source_type?: string | null;
  supplier_name?: string | null;
}

const conditionLabel = (c: string) =>
  c === "new" ? "Sıfır" : c === "refurbished" ? "Yenilenmiş" : "2.El";

/** Harici kaynaklı (canlı tedarikçi) sonuç: detay sayfası yoktur, kaynak gizlidir. */
function isLiveResult(part: Part) {
  return part.id.startsWith("ext:");
}

export function PartCard({ part, variant = "grid" }: { part: Part; variant?: "grid" | "list" }) {
  const live = isLiveResult(part);
  if (variant === "list") {
    const listClass = "group flex gap-3 sm:gap-4 rounded-xl bg-card border border-border/60 hover:border-gold/70 hover:shadow-[0_4px_18px_-6px_rgba(0,0,0,0.5)] transition-all p-2.5 sm:p-3";
    const ListShell = ({ children }: { children: React.ReactNode }) =>
      live ? (
        <div className={listClass}>{children}</div>
      ) : (
        <Link to="/parts/$id" params={{ id: buildPartParam(part) }} className={listClass}>
          {children}
        </Link>
      );
    return (
      <ListShell>
        <div className="relative size-24 sm:size-28 lg:size-32 shrink-0 rounded-lg overflow-hidden bg-secondary">
          <SafePartImage
            images={part.photos}
            alt={part.title}
            width={320}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            brand={part.brand}
            oemCode={part.oem_code}
            oemCodes={part.oem_codes ?? undefined}
            showPlaceholderText={false}
            placeholderSize="sm"
          />
          <NewBadge createdAt={part.created_at} className="absolute bottom-1.5 left-1.5" />
          <DeliveryBadges
            options={part.delivery_options}
            urgent={part.urgent_delivery}
            variant="compact"
            max={3}
            className="absolute bottom-1.5 right-1.5"
          />
          {part.is_sold && <SoldRibbon />}
          <SupplierStockBadge part={part} className="absolute top-1.5 right-1.5" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1 py-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {part.part_type && <PartTypeBadge partType={part.part_type} size="sm" />}
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                part.condition === "new"
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : part.condition === "refurbished"
                    ? "bg-violet-600 text-white border-violet-700"
                    : "bg-zinc-600 text-white border-zinc-700"
              }`}
            >
              {conditionLabel(part.condition).toLocaleUpperCase("tr")}
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <h3 className="text-sm sm:text-base font-semibold leading-snug line-clamp-2 flex-1">{part.title}</h3>
            {part.seller_verified && <VerifiedBadge size={14} className="mt-0.5 shrink-0" />}
            {part.seller_trusted && <TrustedSellerBadge size={14} className="mt-0.5 shrink-0" />}
          </div>
          {(part.brand || part.model) && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {[part.brand, part.model, part.year].filter(Boolean).join(" • ")}
            </p>
          )}
          {part.oem_code && (
            <p className="text-[10px] text-muted-foreground/80 font-mono truncate">OEM: {displayOem(part.oem_code)}</p>
          )}
          {part.stock_label && <p className="text-[10px] font-semibold text-amber-600">{part.stock_label}</p>}
          <div className="mt-auto flex items-end justify-between gap-2 pt-1">
            <div className="text-gold font-bold text-base sm:text-lg font-display tracking-wider">
              {part.price != null ? `₺${Number(part.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {part.city && (
                <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <MapPin className="size-3" /> {part.city}
                </div>
              )}
              {!live && (
                <div onClick={(e) => e.preventDefault()}>
                  <FavoriteButton partId={part.id} size="sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      </ListShell>
    );
  }

  const gridClass =
    "card-zoom group flex h-full flex-col rounded-2xl overflow-hidden bg-card border border-border sm:shadow-card hover:border-gold/70";
  const GridShell = ({ children }: { children: React.ReactNode }) =>
    live ? (
      <div className={gridClass}>{children}</div>
    ) : (
      <Link to="/parts/$id" params={{ id: buildPartParam(part) }} className={gridClass}>
        {children}
      </Link>
    );

  return (
    <GridShell>
      <div className="aspect-square bg-secondary relative overflow-hidden">
        <SafePartImage
          images={part.photos}
          alt={part.title}
          width={420}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          brand={part.brand}
          oemCode={part.oem_code}
          oemCodes={part.oem_codes ?? undefined}
          showPlaceholderText={false}
          placeholderSize="md"
        />
        {!live && (
          <div className="absolute top-2 right-2 scale-110 origin-top-right" onClick={(e) => e.preventDefault()}>
            <FavoriteButton partId={part.id} size="sm" />
          </div>
        )}
        <DeliveryBadges
          options={part.delivery_options}
          urgent={part.urgent_delivery}
          variant="compact"
          max={3}
          className="absolute bottom-2 right-2"
        />
        {part.is_sold && <SoldRibbon />}
      </div>
      {/* Rozet şeridi — görselin dışında, üst üste binmeyecek şekilde tek sırada. */}
      <div className="px-3 pt-2.5 sm:px-4.5 flex flex-wrap items-center gap-1.5">
        {part.part_type && <PartTypeBadge partType={part.part_type} size="sm" />}
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[13px] font-bold uppercase tracking-wider ${
            part.condition === "new"
              ? "bg-emerald-600 text-white border-emerald-700 shadow-md"
              : part.condition === "refurbished"
                ? "bg-violet-600 text-white border-violet-700 shadow-md"
                : "bg-zinc-600 text-white border-zinc-700 shadow-md"
          }`}
        >
          {part.condition === "new" ? "SIFIR" : part.condition === "refurbished" ? "YENİLENMİŞ" : "2. EL"}
        </span>
        {part.supplier_stock && <SupplierStockBadge part={part} />}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4.5 space-y-1.5 sm:space-y-2">
        <div className="flex items-start gap-1.5">
          <h3 className="text-sm sm:text-[15px] font-bold leading-snug line-clamp-2 min-h-[2.4rem] sm:min-h-[2.75rem] flex-1">{part.title}</h3>
          {part.seller_verified && <VerifiedBadge size={14} className="mt-0.5 shrink-0" />}
          {part.seller_trusted && <TrustedSellerBadge size={14} className="mt-0.5 shrink-0" />}
        </div>
        {(part.brand || part.model) && (
          <p className="text-xs font-medium text-muted-foreground line-clamp-1">
            {[part.brand, part.model, part.year].filter(Boolean).join(" • ")}
          </p>
        )}
        {part.oem_code && (
          <p className="text-[11px] text-muted-foreground/80 font-mono truncate">OEM: {displayOem(part.oem_code)}</p>
        )}
        {part.stock_label ? (
          <p className="text-[11px] font-semibold text-amber-600">{part.stock_label}</p>
        ) : part.stock_quantity != null && part.stock_quantity > 0 ? (
          <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <Package className="size-3" /> Stokta ({part.stock_quantity})
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between pt-1">
          <div className="text-emerald-600 font-bold text-lg sm:text-xl font-display tracking-wider">
            {part.price != null ? `₺${Number(part.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
          </div>
          {part.city && (
            <div className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
              <MapPin className="size-3.5" />
              {part.city}
            </div>
          )}
        </div>
        {!live && part.is_sold ? (
          <SoldActions
            size="sm"
            className="mt-2"
            part={{
              id: part.id,
              title: part.title,
              oem_code: part.oem_code ?? null,
              oem_codes: part.oem_codes ?? null,
              brand: part.brand,
              model: part.model,
              year: part.year,
              city: part.city,
            }}
          />
        ) : live && !(part.stock_quantity != null && Number(part.stock_quantity) > 0) ? (
          <button
            type="button"
            disabled
            className="w-full mt-2 h-8 text-xs inline-flex items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground font-semibold cursor-not-allowed"
          >
            Şu anda stokta yok
          </button>
        ) : (
          <AddToCartButton

            size="sm"
            className="w-full mt-2"
            item={{
              part_id: part.id,
              seo_slug: part.seo_slug ?? null,
              title: part.title,
              oem_code: part.oem_code ?? (part.oem_codes && part.oem_codes[0]) ?? null,
              product_code: null,
              seller_id: part.seller_id ?? null,
              seller_name: null,
              photo: (part.photos && part.photos[0]) ?? null,
              unit_price: part.price != null ? Number(part.price) : null,
              supplier_stock: part.supplier_stock ?? false,
              minimum_order_amount: part.minimum_order_amount ?? null,
              single_shipment_allowed: part.single_shipment_allowed ?? true,
              procurement_days: part.procurement_days ?? null,
            }}
          />
        )}
      </div>
    </GridShell>
  );
}
