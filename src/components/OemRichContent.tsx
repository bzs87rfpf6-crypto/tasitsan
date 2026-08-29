// SEO Growth 2.0 — OEM sayfası için zengin içerik bloğu.
import type { OemLandingInput } from "@/lib/oem-landing-content";
import { buildOemLandingSections, buildOemFaq } from "@/lib/oem-landing-content";
import { useMemo } from "react";

function renderInline(text: string) {
  // Minimal **bold** desteği, satır sonlarını korur.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function renderBody(body: string) {
  return body.split(/\n\n+/).map((para, i) => {
    if (para.trim().startsWith("- ")) {
      const items = para.split("\n").filter((l) => l.trim().startsWith("- "));
      return (
        <ul key={i} className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          {items.map((it, j) => <li key={j}>{renderInline(it.replace(/^- /, ""))}</li>)}
        </ul>
      );
    }
    return (
      <p key={i} className="text-sm leading-relaxed text-muted-foreground">
        {renderInline(para)}
      </p>
    );
  });
}

export function OemRichContent({ data }: { data: OemLandingInput }) {
  const sections = useMemo(() => buildOemLandingSections(data), [data]);
  const faqs = useMemo(() => buildOemFaq(data), [data]);

  return (
    <article className="space-y-6">
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-base sm:text-lg font-display tracking-wide text-foreground">{s.heading}</h2>
          <div className="space-y-3">{renderBody(s.body)}</div>
        </section>
      ))}

      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-base sm:text-lg font-display tracking-wide text-foreground">Sık Sorulan Sorular</h2>
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <details key={i} className="text-sm">
              <summary className="cursor-pointer font-semibold py-1">{f.q}</summary>
              <p className="mt-1 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </article>
  );
}
