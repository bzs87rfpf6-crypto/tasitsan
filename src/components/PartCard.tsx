import { Link } from "@tanstack/react-router";
import { MapPin, Package } from "lucide-react";
import { SafePartImage } from "@/components/SafePartImage";
import { FavoriteButton } from "@/components/FavoriteButton";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PartTypeBadge } from "@/components/PartTypeBadge";

export interface Part {
  id: string;
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
  oem_code?: string | null;
  seller_verified?: boolean;
}

export function PartCard({ part }: { part: Part }) {
  return (
    <Link
      to="/parts/$id"
      params={{ id: part.id }}
      className="group block rounded-xl overflow-hidden bg-card border border-border hover:border-gold transition-colors"
    >
      <div className="aspect-square bg-secondary relative overflow-hidden">
        <SafePartImage
          images={part.photos}
          alt={part.title}
          width={420}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-background/80 text-gold px-2 py-0.5 rounded-full border border-gold/30">
          {part.condition === "new" ? "Sıfır" : part.condition === "refurbished" ? "Yenilenmiş" : "2.El"}
        </span>
        {part.part_type && (
          <div className="absolute bottom-2 left-2">
            <PartTypeBadge partType={part.part_type} size="sm" />
          </div>
        )}
        {part.stock_quantity != null && part.stock_quantity > 0 && (
          <span className="absolute top-2 right-11 text-[10px] font-semibold bg-background/80 text-foreground px-2 py-0.5 rounded-full border border-border flex items-center gap-1">
            <Package className="size-3" /> {part.stock_quantity}
          </span>
        )}
        <div className="absolute top-2 right-2" onClick={(e) => e.preventDefault()}>
          <FavoriteButton partId={part.id} size="sm" />
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <h3 className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem] flex-1">{part.title}</h3>
          {part.seller_verified && <VerifiedBadge size={14} className="mt-0.5" />}
        </div>
        {(part.brand || part.model) && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {[part.brand, part.model, part.year].filter(Boolean).join(" • ")}
          </p>
        )}
        {part.oem_code && (
          <p className="text-[10px] text-muted-foreground/80 font-mono truncate">OEM: {part.oem_code}</p>
        )}
        <div className="flex items-end justify-between pt-1">
          <div className="text-gold font-bold text-base font-display tracking-wider">
            {part.price != null ? `₺${Number(part.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
          </div>
          {part.city && (
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MapPin className="size-3" />
              {part.city}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
