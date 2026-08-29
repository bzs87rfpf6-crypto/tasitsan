// SEO Faz 7 — Ürün sayfasına AI ile zenginleştirilmiş bölümler (lazy).
// Sunucudan on-demand içerik çeker; hata veya boş yanıt olursa hiçbir şey render etmez.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getEnrichedProductContent, type ProductAiContent } from "@/lib/ai-product-content.functions";
import { Sparkles, AlertTriangle, Wrench, HelpCircle } from "lucide-react";

interface Props {
  partId: string;
}

export function AiEnrichedSections({ partId }: Props) {
  const [content, setContent] = useState<ProductAiContent | null>(null);
  const fetchContent = useServerFn(getEnrichedProductContent);

  useEffect(() => {
    let cancelled = false;
    fetchContent({ data: { id: partId } })
      .then((res) => { if (!cancelled) setContent(res); })
      .catch((e) => { console.warn("[ai-enriched-sections] failed", e); });
    return () => { cancelled = true; };
  }, [partId, fetchContent]);

  if (!content) return null;
  const hasBody = content.overview || content.function || content.symptoms.length > 0 || content.faq.length > 0;
  if (!hasBody) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4">
      <header className="flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Parça Rehberi</h2>
          <p className="text-[10px] text-muted-foreground">
            Bu bilgiler yapay zeka tarafından ilan verisinden derlenmiştir; kritik uygulamalar için satıcı ile teyit edin.
          </p>
        </div>
      </header>

      {content.overview && (
        <div className="text-sm leading-relaxed text-muted-foreground">{content.overview}</div>
      )}

      {content.function && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/80 font-semibold mb-1">Görevi</h3>
          <p className="text-sm text-muted-foreground">{content.function}</p>
        </div>
      )}

      {content.symptoms.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/80 font-semibold mb-1 flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-gold" /> Arıza Belirtileri
          </h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {content.symptoms.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {content.replace_when && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/80 font-semibold mb-1">Ne Zaman Değiştirilmeli</h3>
          <p className="text-sm text-muted-foreground">{content.replace_when}</p>
        </div>
      )}

      {content.install_notes && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/80 font-semibold mb-1 flex items-center gap-1.5">
            <Wrench className="size-3.5 text-gold" /> Montaj Notları
          </h3>
          <p className="text-sm text-muted-foreground">{content.install_notes}</p>
        </div>
      )}

      {content.faq.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-foreground/80 font-semibold mb-2 flex items-center gap-1.5">
            <HelpCircle className="size-3.5 text-gold" /> Sık Sorulan Sorular
          </h3>
          <div className="space-y-2">
            {content.faq.map((f, i) => (
              <details key={i} className="rounded-md border border-border/60 bg-background/40 p-2">
                <summary className="text-sm font-medium cursor-pointer">{f.q}</summary>
                <p className="text-sm text-muted-foreground mt-1.5">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
