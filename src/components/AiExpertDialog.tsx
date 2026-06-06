import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Search, RefreshCw, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { interpretPartQuery } from "@/lib/api/ai-expert.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PartCard, type Part } from "@/components/PartCard";
import { PART_TYPE_META, type PartType } from "@/lib/part-type";

type Interpretation = {
  brand: string;
  model: string;
  year: number;
  part_name: string;
  category: string;
  confidence: number;
  keywords: string[];
  candidate_oems: string[];
  equivalent_oems: string[];
  notes: string;
};

type OemGroup = {
  oem: string;
  kind: "candidate" | "equivalent";
  parts: Part[];
  sellerCount: number;
  byType: Partial<Record<PartType | "unspecified", number>>;
};

const SUGGESTIONS = [
  "2018 Toyota Corolla sağ ön far",
  "2022 Toyota Hilux PM sensörü",
  "2017 Fiat Doblo sol stop",
  "Renault Megane 4 turbo hortumu",
];

export function AiExpertDialog({
  open,
  onOpenChange,
  onCreateRequest,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreateRequest?: (initial: { search_query: string; brand: string; model: string; year: string; oem: string; category: string }) => void;
}) {
  const interpret = useServerFn(interpretPartQuery);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [groups, setGroups] = useState<OemGroup[]>([]);
  const [fallback, setFallback] = useState<Part[]>([]);

  const reset = () => {
    setQuery(""); setInterpretation(null); setGroups([]); setFallback([]); setLoading(false);
  };

  const runSearch = async (q?: string) => {
    const text = (q ?? query).trim();
    if (text.length < 3) { toast.error("En az 3 karakter yazın."); return; }
    setLoading(true);
    setInterpretation(null); setGroups([]); setFallback([]);
    try {
      const res = await interpret({ data: { query: text } });
      if (!res.ok) { toast.error(res.error); setLoading(false); return; }
      const r = res.result;
      setInterpretation(r);

      const allOems = [
        ...r.candidate_oems.map((o) => ({ oem: o, kind: "candidate" as const })),
        ...r.equivalent_oems
          .filter((o) => !r.candidate_oems.includes(o))
          .map((o) => ({ oem: o, kind: "equivalent" as const })),
      ];

      const grouped: OemGroup[] = [];
      for (const { oem, kind } of allOems) {
        const { data } = await supabase
          .from("parts")
          .select("id,title,brand,model,year,price,city,photos,condition,stock_quantity,oem_code,part_type,seller_id")
          .eq("status", "approved")
          .or(`oem_code.ilike.%${oem}%,oem_codes.cs.{${oem}}`)
          .limit(20);
        const parts = (data ?? []) as (Part & { seller_id: string })[];
        if (!parts.length) continue;
        const sellerCount = new Set(parts.map((p) => p.seller_id).filter(Boolean)).size;
        const byType: OemGroup["byType"] = {};
        for (const p of parts) {
          const k = (p.part_type as PartType | null) ?? "unspecified";
          byType[k] = (byType[k] ?? 0) + 1;
        }
        grouped.push({ oem, kind, parts, sellerCount, byType });
      }
      setGroups(grouped);

      // Fallback brand+model+keyword search if no OEM matched anything.
      if (grouped.length === 0) {
        let qy = supabase.from("parts")
          .select("id,title,brand,model,year,price,city,photos,condition,stock_quantity,oem_code,part_type")
          .eq("status", "approved")
          .limit(12);
        if (r.brand) qy = qy.ilike("brand", `%${r.brand}%`);
        if (r.model) qy = qy.ilike("model", `%${r.model}%`);
        const { data } = await qy;
        setFallback((data ?? []) as Part[]);
      }
    } catch (e) {
      console.error(e);
      toast.error("Arama yapılamadı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide flex items-center gap-2">
            <Sparkles className="size-5 text-gold" /> AI Parça Uzmanı
          </DialogTitle>
          <DialogDescription>
            OEM bilmenize gerek yok. Aracınızı ve parçayı doğal dilde yazın, yapay zeka OEM/eşdeğer kodları üretip Taşıtsan stoklarında arasın.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); void runSearch(); }}
          className="flex gap-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Örn: 2018 Corolla sağ ön far"
            maxLength={300}
            className="h-12 bg-card"
            autoFocus
          />
          <Button type="submit" disabled={loading} className="h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold shrink-0">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </form>

        {!interpretation && !loading && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Örnek aramalar</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setQuery(s); void runSearch(s); }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-card hover:border-gold/60 hover:text-gold"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-gold" /> Yapay zeka analiz ediyor...
          </div>
        )}

        {interpretation && !loading && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-gold font-semibold">Tespit Edilen</p>
                  <h3 className="font-display text-lg leading-tight">
                    {[interpretation.brand, interpretation.model, interpretation.year > 0 ? interpretation.year : ""].filter(Boolean).join(" ")}
                    {interpretation.part_name ? ` · ${interpretation.part_name}` : ""}
                  </h3>
                  <p className="text-xs text-muted-foreground">{interpretation.category}</p>
                </div>
                <div className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold border bg-gold/15 text-gold border-gold/30">
                  %{interpretation.confidence} güven
                </div>
              </div>
              {interpretation.notes && (
                <p className="text-xs text-muted-foreground leading-relaxed">{interpretation.notes}</p>
              )}
              {(interpretation.candidate_oems.length > 0 || interpretation.equivalent_oems.length > 0) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {interpretation.candidate_oems.map((o) => (
                    <span key={`c-${o}`} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30">
                      {o}
                    </span>
                  ))}
                  {interpretation.equivalent_oems
                    .filter((o) => !interpretation.candidate_oems.includes(o))
                    .map((o) => (
                      <span key={`e-${o}`} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        ≈ {o}
                      </span>
                    ))}
                </div>
              )}
              <div className="pt-1">
                <button onClick={() => reset()} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw className="size-3" /> Yeni arama
                </button>
              </div>
            </div>

            {groups.length > 0 ? (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.oem} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
                          g.kind === "candidate"
                            ? "bg-gold/15 text-gold border-gold/40"
                            : "bg-muted text-muted-foreground border-border"
                        }`}>
                          {g.kind === "candidate" ? "OEM" : "Eşdeğer"}
                        </span>
                        <span className="font-mono text-sm">{g.oem}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.parts.length} ürün · {g.sellerCount} satıcı
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.entries(g.byType) as Array<[PartType | "unspecified", number]>).map(([k, n]) => {
                        if (k === "unspecified") {
                          return (
                            <span key="u" className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
                              Belirtilmemiş · {n}
                            </span>
                          );
                        }
                        const m = PART_TYPE_META[k];
                        return (
                          <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full border ${m.badgeClass}`}>
                            {m.emoji} {m.label} · {n}
                          </span>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {g.parts.slice(0, 6).map((p) => (
                        <PartCard key={p.id} part={p} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-5 text-center space-y-3">
                <PackageSearch className="size-7 text-muted-foreground mx-auto" />
                <p className="text-sm">Bu OEM numaraları için stokta eşleşme bulunamadı.</p>
                {onCreateRequest && (
                  <Button
                    onClick={() => {
                      onCreateRequest({
                        search_query: interpretation.part_name || query,
                        brand: interpretation.brand || "",
                        model: interpretation.model || "",
                        year: interpretation.year > 0 ? String(interpretation.year) : "",
                        oem: interpretation.candidate_oems[0] || "",
                        category: interpretation.category || "",
                      });
                      onOpenChange(false);
                    }}
                    className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold"
                  >
                    🚀 Parça Talebi Oluştur
                  </Button>
                )}
                {fallback.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground pt-2">Marka/modele göre benzer ürünler:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                      {fallback.map((p) => <PartCard key={p.id} part={p} />)}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
