import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";

export interface Part {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  city: string | null;
  photos: string[];
  condition: string;
}

export function PartCard({ part }: { part: Part }) {
  const photo = part.photos[0];
  return (
    <Link
      to="/parts/$id"
      params={{ id: part.id }}
      className="group block rounded-xl overflow-hidden bg-card border border-border hover:border-gold transition-colors"
    >
      <div className="aspect-square bg-secondary relative overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={part.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
            Fotoğraf yok
          </div>
        )}
        <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-background/80 text-gold px-2 py-0.5 rounded-full border border-gold/30">
          {part.condition === "new" ? "Sıfır" : part.condition === "refurbished" ? "Yenilenmiş" : "2.El"}
        </span>
      </div>
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{part.title}</h3>
        {(part.brand || part.model) && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {[part.brand, part.model, part.year].filter(Boolean).join(" • ")}
          </p>
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
