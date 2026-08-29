import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

export function CartButton({ className = "" }: { className?: string }) {
  const { totalQuantity, ready } = useCart();
  return (
    <Link
      to="/cart"
      aria-label={`Sepet (${totalQuantity} ürün)`}
      className={`relative inline-flex items-center justify-center size-10 rounded-full bg-card border border-border hover:border-gold/60 transition ${className}`}
    >
      <ShoppingCart className="size-5 text-gold" />
      {ready && totalQuantity > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gold-gradient text-gold-foreground text-[10px] font-bold grid place-items-center border border-background">
          {totalQuantity > 99 ? "99+" : totalQuantity}
        </span>
      )}
    </Link>
  );
}
