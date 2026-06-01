import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { PartCard, type Part } from "@/components/PartCard";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Taşıtsan Parça Borsası — Yedek Parça Ara" },
      { name: "description", content: "Binlerce yedek parça arasından ara, Taşıtsan ile güvenli iletişime geç." },
    ],
  }),
  component: Index,
});

const CATEGORIES = ["Tümü", "Motor", "Şanzıman", "Kaporta", "Fren", "Elektrik", "Lastik", "İç Aksam"];

function Index() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Tümü");
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      let query = supabase
        .from("parts")
        .select("id,title,brand,model,year,price,city,photos,condition,category")
        .order("created_at", { ascending: false })
        .limit(60);
      if (cat !== "Tümü") query = query.eq("category", cat);
      if (q.trim()) query = query.or(`title.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`);
      const { data } = await query;
      if (active) {
        setParts((data ?? []) as Part[]);
        setLoading(false);
      }
    }, 200);
    return () => { active = false; clearTimeout(t); };
  }, [q, cat]);

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Parça, marka, model ara..."
            className="pl-10 h-12 bg-card border-border rounded-xl"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-all ${
                cat === c
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        ) : parts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-5xl">🔧</div>
            <p className="text-muted-foreground text-sm">Hiç ilan yok. İlk ilanı sen ver!</p>
            <Link to="/sell" className="inline-flex rounded-lg bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-gold-foreground shadow-gold">
              İlan ver
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {parts.map((p) => <PartCard key={p.id} part={p} />)}
          </div>
        )}
      </div>

      <Link
        to="/sell"
        className="fixed bottom-20 right-4 z-30 size-14 rounded-full bg-gold-gradient text-gold-foreground grid place-items-center shadow-gold active:scale-95 transition-transform"
        aria-label="İlan ver"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </Link>

      <BottomNav />
    </div>
  );
}
