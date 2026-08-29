import { translateError } from "@/lib/error-messages";
import { useState } from "react";
import { Sparkles, Loader2, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  suggestEquivalentOems,
  confidenceTier,
  type OemAiSuggestion,
} from "@/lib/ai-oem.functions";

interface Props {
  oem: string;
  brand?: string | null;
  model?: string | null;
  title?: string | null;
}

function ConfidenceBadge({ value }: { value: number }) {
  const tier = confidenceTier(value);
  const cls =
    tier === "high"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : tier === "medium"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-red-500/15 text-red-300 border-red-500/30";
  const label = tier === "high" ? "Yüksek" : tier === "medium" ? "Orta" : "Düşük";
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${cls} font-semibold uppercase tracking-wider`}>
      {label} · %{Math.round(value * 100)}
    </span>
  );
}

export function AiOemSuggester({ oem, brand, model, title }: Props) {
  const call = useServerFn(suggestEquivalentOems);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OemAiSuggestion | null>(null);

  const run = async (force = false) => {
    setLoading(true);
    try {
      const data = await call({ data: { oem, brand, model, title, force } });
      setResult(data);
    } catch (e) {
      toast.error(translateError(e, "AI önerisi alınamadı"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-display text-gold tracking-wide flex items-center gap-1.5">
            <Sparkles className="size-4" /> Yapay zekâ ile OEM analizi
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Olası eşdeğer OEM kodları (güven skoruyla), muadil markalar, uyumlu araçlar ve alternatif parça isimleri.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={loading || !oem}
            className="h-9 px-3 rounded-lg text-xs font-semibold bg-gold-gradient text-gold-foreground shadow-gold disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {result ? "Yenile" : "Analiz Et"}
          </button>
          {result?.cached && (
            <button
              type="button"
              onClick={() => run(true)}
              disabled={loading}
              className="h-7 px-2 rounded-md text-[10px] border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
              title="Cache'i atla ve AI'dan yeniden çek"
            >
              <RefreshCw className="size-3" /> Yeniden çek
            </button>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-2.5 text-xs">
          {result.cached && (
            <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground bg-card/50 border border-border rounded px-2 py-1">
              <Database className="size-3" />
              Önbellekten geldi
              {result.cache_age_hours != null && (
                <span>· {result.cache_age_hours < 1 ? "<1 saat" : `${Math.round(result.cache_age_hours)} saat önce`}</span>
              )}
            </div>
          )}

          {result.equivalent_oems.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-[10px] text-gold mb-1.5">
                Eşdeğer OEM ({result.equivalent_oems.length})
              </p>
              <div className="space-y-1.5">
                {result.equivalent_oems.map((eq) => (
                  <div
                    key={eq.code}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-card border border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs truncate">{eq.code}</p>
                      {eq.brand && <p className="text-[10px] text-muted-foreground">{eq.brand}</p>}
                    </div>
                    <ConfidenceBadge value={eq.confidence} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.compatible_vehicles.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-[10px] text-gold mb-1">Uyumlu araçlar</p>
              <div className="flex flex-wrap gap-1.5">
                {result.compatible_vehicles.map((c) => (
                  <span key={c} className="px-2 py-1 rounded-md bg-card border border-border">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.similar_parts.length > 0 && (
            <div>
              <p className="uppercase tracking-wider text-[10px] text-gold mb-1">Benzer parçalar</p>
              <div className="flex flex-wrap gap-1.5">
                {result.similar_parts.map((c) => (
                  <span key={c} className="px-2 py-1 rounded-md bg-card border border-border">
                    {c}
                  </span>
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

          <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 pt-1 border-t border-border/50">
            <ShieldCheck className="size-3" />
            AI önerisidir, satın almadan önce satıcı ile doğrulayın.
          </p>
        </div>
      )}
    </section>
  );
}
