import { useState } from "react";
import { toast } from "sonner";
import { ShoppingCart, Check, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCart, type CartItem } from "@/lib/cart";
import { materializeExternalPart } from "@/lib/external-oem.functions";

interface Props {
  item: Omit<CartItem, "quantity">;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

/** Canlı tedarikçi sonucu (henüz kalıcı ürün kaydı yok). */
const isLiveItem = (id: string) => id.startsWith("ext:");

export function AddToCartButton({ item, size = "md", className = "", label = "Sepete Ekle" }: Props) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const materialize = useServerFn(materializeExternalPart);

  const done = (finalItem: Omit<CartItem, "quantity">) => {
    add(finalItem, 1);
    toast.success("Ürün sepete eklendi", { description: finalItem.title });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    if (!isLiveItem(item.part_id)) {
      done(item);
      return;
    }

    setBusy(true);
    try {
      const res = await materialize({ data: { oem: item.part_id.replace(/^ext:/, "") || (item.oem_code ?? "") } });
      if (!res.part_id) {
        toast.error("Ürün şu anda sepete eklenemiyor", {
          description: res.error ?? "Lütfen daha sonra tekrar deneyin.",
        });
        return;
      }

      done({
        ...item,
        part_id: res.part_id,
        unit_price: res.price ?? item.unit_price,
        title: res.title ?? item.title,
      });
    } catch {
      toast.error("Ürün şu anda sepete eklenemiyor");
    } finally {
      setBusy(false);
    }
  };

  const heights = { sm: "h-8 text-xs", md: "h-11 text-sm", lg: "h-14 text-base" }[size];

  return (
    <button
      onClick={handle}
      disabled={busy}
      aria-label="Sepete ekle"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-95 active:scale-[0.98] transition disabled:opacity-70 ${heights} ${className}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : added ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
      {busy ? "Ekleniyor" : added ? "Eklendi" : label}
    </button>
  );
}
