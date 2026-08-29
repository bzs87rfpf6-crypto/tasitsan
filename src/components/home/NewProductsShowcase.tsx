import { Sparkles, Loader2 } from "lucide-react";
import { PartCard, type Part } from "@/components/PartCard";
import { Button } from "@/components/ui/button";

export interface ShowcasePart extends Part {
  created_at?: string;
  seller_id?: string;
}

export function NewProductsShowcase({
  items,
  total,
  loading,
  loadingMore,
  onLoadMore,
}: {
  items: ShowcasePart[];
  total: number;
  loading?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  if (!loading && items.length === 0) return null;

  const hasMore = items.length < total;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base sm:text-lg flex items-center gap-2">
          <Sparkles className="size-4 text-gold" />
          Yeni Eklenen Ürünler
        </h2>
        {total > 0 && (
          <span className="text-[11px] text-muted-foreground font-semibold">
            {items.length.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")} ürün
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 items-stretch">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 items-stretch">
            {items.map((p) => (
              <PartCard key={p.id} part={p} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="min-w-44"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Yükleniyor…
                  </>
                ) : (
                  "Daha Fazla Göster"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
