import { translateError } from "@/lib/error-messages";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { addFavorite, removeFavorite, getMyFavoriteIds } from "@/lib/favorites";
import { SignupPromptDialog } from "@/components/SignupPromptDialog";

interface Props {
  partId: string;
  size?: "sm" | "md" | "lg";
  variant?: "overlay" | "inline";
  className?: string;
}

// Aynı kullanıcı için bütün FavoriteButton örnekleri tek sorguyu paylaşır.
let favoriteCacheUserId: string | null = null;
let favoriteIdsCache: Set<string> | null = null;
let favoriteIdsPromise: Promise<Set<string>> | null = null;

function loadFavoriteIds(userId: string): Promise<Set<string>> {
  if (favoriteCacheUserId !== userId) {
    favoriteCacheUserId = userId;
    favoriteIdsCache = null;
    favoriteIdsPromise = null;
  }

  if (favoriteIdsCache) {
    return Promise.resolve(favoriteIdsCache);
  }

  if (!favoriteIdsPromise) {
    favoriteIdsPromise = getMyFavoriteIds(userId).then((ids) => {
      favoriteIdsCache = ids;
      return ids;
    }).finally(() => {
      favoriteIdsPromise = null;
    });
  }

  return favoriteIdsPromise;
}

export function FavoriteButton({ partId, size = "md", variant = "overlay", className = "" }: Props) {
  const { user } = useAuth();
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setFav(false);
      return;
    }

    let active = true;

    loadFavoriteIds(user.id).then((ids) => {
      if (active) setFav(ids.has(partId));
    });

    return () => {
      active = false;
    };
  }, [user, partId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setPromptOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !fav;
    setFav(next);
    try {
      if (next) await addFavorite(user.id, partId);
      else await removeFavorite(user.id, partId);

      if (favoriteCacheUserId === user.id && favoriteIdsCache) {
        if (next) favoriteIdsCache.add(partId);
        else favoriteIdsCache.delete(partId);
      }

      toast.success(next ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
    } catch (err: any) {
      setFav(!next);
      toast.error(translateError(err, "İşlem başarısız"));
    } finally {
      setBusy(false);
    }
  };

  const iconSize = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-4";
  const btnSize = size === "lg" ? "size-11" : size === "sm" ? "size-7" : "size-9";

  const button = variant === "overlay" ? (
    <button
      type="button"
      onClick={toggle}
      aria-label={fav ? "Favorilerden çıkar" : "Favorilere ekle"}
      aria-pressed={fav}
      className={`${btnSize} rounded-full grid place-items-center bg-background/85 backdrop-blur border border-border hover:border-gold active:scale-95 transition ${className}`}
    >
      <Heart className={`${iconSize} transition ${fav ? "fill-destructive text-destructive" : "text-foreground"}`} strokeWidth={2.2} />
    </button>
  ) : (
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

  return (
    <>
      {button}
      <SignupPromptDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title="Favorilere eklemek için üye olun"
        source="favorite_button"
      />
    </>
  );
}
