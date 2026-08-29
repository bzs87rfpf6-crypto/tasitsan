import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, FileDown, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { runSeoQaAudit } from "@/lib/seo-qa.functions";

type Status = "pass" | "warn" | "fail";
type Check = { id: string; label: string; status: Status; detail?: string };
type PageAudit = { url: string; status: number; score: number; checks: Check[] };
type Report = {
  generatedAt: string;
  siteScore: number;
  siteChecks: Check[];
  pageAudits: PageAudit[];
  brokenLinks: Array<{ url: string; status: number; ok: boolean }>;
  products: Array<{ id: string; title: string; url: string; liveScore: number; storedScore: number | null }>;
  sampleSize: number;
};

const StatusIcon = ({ s }: { s: Status }) => {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
};

const StatusBadge = ({ s }: { s: Status }) => (
  <Badge
    variant="outline"
    className={
      s === "pass"
        ? "border-green-300 bg-green-50 text-green-700"
        : s === "warn"
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-red-300 bg-red-50 text-red-700"
    }
  >
    {s === "pass" ? "✓ Pass" : s === "warn" ? "⚠ Warning" : "✗ Failed"}
  </Badge>
);

function scoreColor(n: number): string {
  if (n >= 85) return "text-green-600";
  if (n >= 65) return "text-amber-600";
  return "text-red-600";
}

export function SeoQaPanel() {
  const run = useServerFn(runSeoQaAudit);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const start = async () => {
    setLoading(true);
    try {
      const r = (await run({ data: { sample: 15 } })) as Report;
      setReport(r);
      toast.success(`SEO audit tamamlandı — skor: ${r.siteScore}/100`);
    } catch (e) {
      toast.error("Audit başarısız: " + (e instanceof Error ? e.message : "hata"));
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = () => {
    // Browser print → "Save as PDF". Uses a print stylesheet in this component.
    window.print();
  };

  return (
    <Card id="seo-qa-panel" className="print:shadow-none">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #seo-qa-panel, #seo-qa-panel * { visibility: visible; }
          #seo-qa-panel { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>SEO QA Suite</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Otomatik denetim: title, description, canonical, OG, Twitter, JSON-LD, alt, iç link, kırık link, duplicate,
            robots, sitemap, mobil, hız, indeksleme.
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Button onClick={start} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run Full SEO Audit
          </Button>
          {report && (
            <Button variant="outline" onClick={exportPdf}>
              <FileDown className="h-4 w-4 mr-2" />
              PDF
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!report && !loading && (
          <p className="text-sm text-muted-foreground">
            Başlatmak için <b>Run Full SEO Audit</b>'e tıkla. ~15 ürün sayfası + anasayfa + robots + sitemap denetlenir.
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sayfalar taranıyor…
          </div>
        )}
        {report && (
          <>
            {/* Site score */}
            <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
              <div>
                <div className="text-xs text-muted-foreground">Site-Wide SEO Score</div>
                <div className={`text-4xl font-bold ${scoreColor(report.siteScore)}`}>{report.siteScore}/100</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{new Date(report.generatedAt).toLocaleString("tr-TR")}</div>
                <div>{report.sampleSize} ürün sayfası örneklendi</div>
              </div>
            </div>

            {/* Site-wide checks */}
            <div>
              <h3 className="font-semibold mb-2">Site-Wide Checks</h3>
              <div className="space-y-1">
                {report.siteChecks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusIcon s={c.status} />
                      <span className="font-medium">{c.label}</span>
                      {c.detail && <span className="text-muted-foreground">— {c.detail}</span>}
                    </div>
                    <StatusBadge s={c.status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Broken links */}
            {report.brokenLinks.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-red-700">Kırık Linkler</h3>
                <ul className="text-xs space-y-1">
                  {report.brokenLinks.map((b) => (
                    <li key={b.url} className="font-mono">
                      HTTP {b.status || "err"} — {b.url}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Products */}
            <div>
              <h3 className="font-semibold mb-2">Ürün Sayfaları ({report.products.length})</h3>
              <div className="rounded border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left">
                    <tr>
                      <th className="p-2">Ürün</th>
                      <th className="p-2 w-24 text-right">Live</th>
                      <th className="p-2 w-24 text-right">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.products.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">
                          <a href={p.url} className="text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                            {p.title}
                          </a>
                        </td>
                        <td className={`p-2 text-right font-mono ${scoreColor(p.liveScore)}`}>{p.liveScore}</td>
                        <td className={`p-2 text-right font-mono ${p.storedScore != null ? scoreColor(p.storedScore) : "text-muted-foreground"}`}>
                          {p.storedScore ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-page detail (collapsed) */}
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Sayfa bazlı check detayları</summary>
              <div className="mt-3 space-y-4">
                {report.pageAudits.map((a) => (
                  <div key={a.url} className="rounded border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-600 hover:underline">
                        {a.url}
                      </a>
                      <span className={`text-sm font-bold ${scoreColor(a.score)}`}>{a.score}/100</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                      {a.checks.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-xs">
                          <StatusIcon s={c.status} />
                          <span className="font-medium">{c.label}:</span>
                          <span className="text-muted-foreground truncate">{c.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
