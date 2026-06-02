import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { addFavorite, removeFavorite } from "@/lib/favorites";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  partId: string;
  size?: "sm" | "md" | "lg";
  variant?: "overlay" | "inline";
  className?: string;
}

export function FavoriteButton({ partId, size = "md", variant = "overlay", className = "" }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setFav(false); return; }
    let active = true;
    supabase.from("favorites").select("part_id")
      .eq("user_id", user.id).eq("part_id", partId).maybeSingle()
      .then(({ data }) => { if (active) setFav(!!data); });
    return () => { active = false; };
  }, [user, partId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info("Favorilere eklemek için giriş yapmalısın");
      nav({ to: "/auth" });
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !fav;
    setFav(next);
    try {
      if (next) await addFavorite(user.id, partId);
      else await removeFavorite(user.id, partId);
      toast.success(next ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
    } catch (err: any) {
      setFav(!next);
      toast.error(err?.message ?? "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  };

  const iconSize = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-4";
  const btnSize = size === "lg" ? "size-11" : size === "sm" ? "size-7" : "size-9";

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={fav ? "Favorilerden çıkar" : "Favorilere ekle"}
        aria-pressed={fav}
        className={`${btnSize} rounded-full grid place-items-center bg-background/85 backdrop-blur border border-border hover:border-gold active:scale-95 transition ${className}`}
      >
        <Heart className={`${iconSize} transition ${fav ? "fill-destructive text-destructive" : "text-foreground"}`} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={fav ? "Favorilerden çıkar" : "Favorilere ekle"}
      aria-pressed={fav}
      className={`flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-card border border-border hover:border-gold font-semibold text-sm active:scale-[0.98] transition ${className}`}
    >
      <Heart className={`size-4 ${fav ? "fill-destructive text-destructive" : "text-foreground"}`} strokeWidth={2.2} />
      {fav ? "Favoride" : "Favoriye Ekle"}
    </button>
  );
}
