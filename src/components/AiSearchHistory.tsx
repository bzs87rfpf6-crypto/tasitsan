// Faz 4/5 — AI Arama Geçmişi (tekrar / favori / sil)
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyAiSearches, toggleAiSearchFavorite, deleteAiSearch, type AiSearchHistoryRow } from "@/lib/ai-history.functions";
import { History, Star, Trash2, Repeat2, Loader2 } from "lucide-react";

export function AiSearchHistory({ onPick }: { onPick: (query: string) => void }) {
  const list = useServerFn(listMyAiSearches);
  const fav = useServerFn(toggleAiSearchFavorite);
  const del = useServerFn(deleteAiSearch);
  const [rows, setRows] = useState<AiSearchHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<"all" | "fav">("all");

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRows(await list({ data: { only_favorites: filter === "fav", limit: 20 } })); }
    finally { setLoading(false); }
  }, [list, filter]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      if (data.user) reload();
    });
  }, [reload]);

  if (!signedIn) return null;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <History className="size-4 text-primary" />
        <div className="text-sm font-semibold">Arama geçmişin</div>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setFilter("all")} className={`text-[11px] px-2 py-0.5 rounded-full ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Tümü</button>
          <button onClick={() => setFilter("fav")} className={`text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 ${filter === "fav" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            <Star className="size-3" /> Favori
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">Henüz kayıt yok.</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-1.5 group">
              <button
                onClick={async () => { await fav({ data: { id: r.id, value: !r.is_favorite } }); reload(); }}
                title={r.is_favorite ? "Favoriden çıkar" : "Favoriye ekle"}
                className={r.is_favorite ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}
              >
                <Star className={`size-3.5 ${r.is_favorite ? "fill-current" : ""}`} />
              </button>
              <button onClick={() => onPick(r.query)} className="flex-1 text-left text-xs truncate hover:text-primary" title={r.query}>
                {r.query}
              </button>
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{r.parts_found}</span>
              <button
                onClick={() => onPick(r.query)}
                title="Tekrar ara"
                className="p-0.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition"
              ><Repeat2 className="size-3.5" /></button>
              <button
                onClick={async () => { await del({ data: { id: r.id } }); reload(); }}
                title="Sil"
                className="p-0.5 text-muted-foreground hover:text-rose-600 opacity-0 group-hover:opacity-100 transition"
              ><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
