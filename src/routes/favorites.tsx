import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PartCard, type Part } from "@/components/PartCard";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Favorilerim — Taşıtsan Parça Borsası" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    (async () => {
      const { data: favs } = await supabase
        .from("favorites")
        .select("part_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (favs ?? []).map((f) => f.part_id as string);
      if (ids.length === 0) {
        if (active) { setParts([]); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("parts")
        .select("id,title,brand,model,year,price,city,photos,condition,stock_quantity,oem_code,status")
        .in("id", ids);
      if (!active) return;
      const map = new Map((data ?? []).map((p: any) => [p.id, p]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Part[];
      setParts(ordered);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  if (authLoading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="size-9 rounded-full grid place-items-center hover:bg-card">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="font-display text-lg tracking-wide flex items-center gap-2">
            <Heart className="size-5 text-destructive fill-destructive" />
            Favorilerim
          </h1>
          <span className="ml-auto text-xs text-muted-foreground">{parts.length} ilan</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-5">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : parts.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-4 bg-card border border-border rounded-2xl">
            <div className="size-16 rounded-full bg-gold/10 grid place-items-center mx-auto">
              <Heart className="size-8 text-gold" />
            </div>
            <div className="space-y-1">
              <p className="font-display text-lg">Henüz favori ilanın yok</p>
              <p className="text-sm text-muted-foreground">İlanlardaki kalp simgesine basarak favorilerine ekleyebilirsin.</p>
            </div>
            <Link to="/" className="inline-block text-gold font-semibold mt-2 hover:underline">
              İlanlara Göz At →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {parts.map((p) => <PartCard key={p.id} part={p} />)}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
