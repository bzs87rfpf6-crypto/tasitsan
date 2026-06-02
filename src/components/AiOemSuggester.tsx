import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { suggestEquivalentOems, type OemAiSuggestion } from "@/lib/ai-oem.functions";

interface Props {
  oem: string;
  brand?: string | null;
  model?: string | null;
  title?: string | null;
}

export function AiOemSuggester({ oem, brand, model, title }: Props) {
  const call = useServerFn(suggestEquivalentOems);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OemAiSuggestion | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const data = await call({ data: { oem, brand, model, title } });
      setResult(data);
    } catch (e: any) {
      toast.error(e?.message ?? "AI önerisi alınamadı");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-display text-gold tracking-wide flex items-center gap-1.5">
            <Sparkles className="size-4" /> Yapay zekâ ile eşdeğer öner
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            OEM için olası eşdeğer kodlar, uyumlu araçlar ve alternatif parça isimleri.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || !oem}
          className="shrink-0 h-9 px-3 rounded-lg text-xs font-semibold bg-gold-gradient text-gold-foreground shadow-gold disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {result ? "Yenile" : "Öner"}
        </button>
      </div>

      {result && (
        <div className="space-y-2.5 text-xs">
          {result.equivalent_oems.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-[10px] text-gold mb-1">Eşdeğer OEM</p>
              <div className="flex flex-wrap gap-1.5">
                {result.equivalent_oems.map((c) => (
                  <span key={c} className="font-mono px-2 py-1 rounded-md bg-card border border-border">{c}</span>
                ))}
              </div>
            </div>
          )}
          {result.compatible_vehicles.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-[10px] text-gold mb-1">Uyumlu araçlar</p>
              <div className="flex flex-wrap gap-1.5">
                {result.compatible_vehicles.map((c) => (
                  <span key={c} className="px-2 py-1 rounded-md bg-card border border-border">{c}</span>
                ))}
              </div>
            </div>
          )}
          {result.similar_parts.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-[10px] text-gold mb-1">Benzer parçalar</p>
              <div className="flex flex-wrap gap-1.5">
                {result.similar_parts.map((c) => (
                  <span key={c} className="px-2 py-1 rounded-md bg-card border border-border">{c}</span>
                ))}
              </div>
            </div>
          )}
          {result.notes && <p className="text-muted-foreground leading-relaxed">{result.notes}</p>}
          {result.equivalent_oems.length === 0 &&
            result.compatible_vehicles.length === 0 &&
            result.similar_parts.length === 0 && (
              <p className="text-muted-foreground">Bu OEM için yapay zekâ güvenilir bir öneri bulamadı.</p>
            )}
        </div>
      )}
    </section>
  );
}
