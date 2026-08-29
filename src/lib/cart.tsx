import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartItem {
  part_id: string;
  seo_slug?: string | null;
  title: string;
  oem_code: string | null;
  product_code: string | null;
  seller_id: string | null;
  seller_name: string | null;
  photo: string | null;
  unit_price: number | null;
  quantity: number;
  supplier_stock?: boolean | null;
  minimum_order_amount?: number | null;
  single_shipment_allowed?: boolean | null;
  procurement_days?: number | null;
}

interface CartContextValue {
  items: CartItem[];
  totalQuantity: number;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQuantity: (part_id: string, qty: number) => void;
  remove: (part_id: string) => void;
  clear: () => void;
  ready: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "ts:cart:v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, ready]);

  const add = useCallback((item: Omit<CartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.part_id === item.part_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: Math.min(999, next[idx].quantity + qty) };
        return next;
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const setQuantity = useCallback((part_id: string, qty: number) => {
    setItems((prev) => prev.map((p) => (p.part_id === part_id ? { ...p, quantity: Math.max(1, Math.min(999, qty)) } : p)));
  }, []);

  const remove = useCallback((part_id: string) => {
    setItems((prev) => prev.filter((p) => p.part_id !== part_id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalQuantity = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  const value = useMemo<CartContextValue>(
    () => ({ items, totalQuantity, add, setQuantity, remove, clear, ready }),
    [items, totalQuantity, add, setQuantity, remove, clear, ready]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
