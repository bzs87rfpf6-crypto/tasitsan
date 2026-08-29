import { Fragment, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { debugOemImageSearch, type ImageSearchDebugResult, type ProviderDebugResult } from "@/lib/oem-image-search-debug.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  not_configured: "bg-muted text-muted-foreground",
  auth: "bg-red-500/15 text-red-700 dark:text-red-300",
  rate_limit: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  timeout: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  network: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  server: "bg-red-500/15 text-red-700 dark:text-red-300",
  parse: "bg-red-500/15 text-red-700 dark:text-red-300",
  unknown: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function statusBadge(r: ProviderDebugResult) {
  if (!r.configured) return { label: "API anahtarı yok", key: "not_configured" };
  if (r.error) return { label: r.errorKind ?? "hata", key: r.errorKind ?? "unknown" };
  if (r.resultsCount === 0) return { label: "0 sonuç", key: "unknown" };
  return { label: `${r.resultsCount} sonuç`, key: "ok" };
}

export function OemImageSearchTestPanel() {
  const [query, setQuery] = useState("MR122305");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImageSearchDebugResult | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const runDebug = useServerFn(debugOemImageSearch);

  async function run() {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await runDebug({ data: { query: query.trim() } });
      setResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test çalıştırılamadı");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">🔬 Görsel Arama Testi</h3>
        <p className="text-sm text-muted-foreground">
          Bir sorguyu tüm görsel/web arama sağlayıcılarına gönderir; provider başına HTTP durumu, sonuç sayısı,
          hata mesajı ve ham yanıtın ilk 500 karakterini gösterir. OEM "0 sonuç" probleminin sorguda mı, API
          anahtarında mı, rate limit'te mi olduğunu tespit etmek için kullanılır.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Test sorgusu (örn: MR122305)"
          onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
        />
        <Button onClick={() => void run()} disabled={loading || !query.trim()}>
          {loading ? "Çalışıyor…" : "Test Et"}
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Sorgu: <span className="font-mono">{result.query}</span> · {new Date(result.ranAt).toLocaleString("tr-TR")}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-2">Provider</th>
                  <th className="py-2 pr-2">Durum</th>
                  <th className="py-2 pr-2">HTTP</th>
                  <th className="py-2 pr-2">Sonuç</th>
                  <th className="py-2 pr-2">Süre</th>
                  <th className="py-2 pr-2">Hata</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => {
                  const b = statusBadge(r);
                  const isOpen = expanded.has(r.provider);
                  return (
                    <Fragment key={r.provider}>
                      <tr className="border-b border-border/50">
                        <td className="py-2 pr-2 font-medium">{r.providerLabel}</td>
                        <td className="py-2 pr-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[b.key] ?? STATUS_COLORS.unknown}`}>{b.label}</span>
                        </td>
                        <td className="py-2 pr-2 font-mono">{r.httpStatus ?? "—"}</td>
                        <td className="py-2 pr-2">{r.resultsCount}</td>
                        <td className="py-2 pr-2">{r.durationMs ? `${r.durationMs}ms` : "—"}</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[280px] truncate" title={r.error ?? ""}>{r.error ?? "—"}</td>
                        <td className="py-2 pr-2">
                          <button className="text-xs text-primary underline" onClick={() => toggle(r.provider)}>
                            {isOpen ? "Gizle" : "Detay"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.provider}-d`} className="bg-muted/30">
                          <td colSpan={7} className="p-3 space-y-2">
                            {r.missingEnv && r.missingEnv.length > 0 && (
                              <div className="text-xs">
                                <span className="font-semibold">Eksik env değişkenleri: </span>
                                <span className="font-mono">{r.missingEnv.join(", ")}</span>
                              </div>
                            )}
                            {r.url && (
                              <div className="text-xs break-all">
                                <span className="font-semibold">URL: </span>
                                <span className="font-mono">{r.url}</span>
                              </div>
                            )}
                            {r.rawBodyPreview && (
                              <div>
                                <div className="text-xs font-semibold mb-1">Ham yanıt (ilk 500 karakter):</div>
                                <pre className="text-[11px] bg-background p-2 rounded border border-border overflow-auto max-h-48 whitespace-pre-wrap break-all">{r.rawBodyPreview}</pre>
                              </div>
                            )}
                            {r.imageUrls.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold mb-1">Görsel URL'leri ({r.imageUrls.length}):</div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                  {r.imageUrls.slice(0, 12).map((u) => (
                                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded border border-border bg-muted">
                                      <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground border-t border-border pt-3">
            <div className="font-semibold mb-1">Yorum:</div>
            <ul className="list-disc pl-5 space-y-1">
              {result.results.filter((r) => !r.configured).length > 0 && (
                <li>
                  <strong>Yapılandırılmamış sağlayıcılar:</strong>{" "}
                  {result.results.filter((r) => !r.configured).map((r) => r.providerLabel).join(", ")}.
                  Bu sağlayıcılar için ilgili API anahtarı eklenmediği sürece sonuç üretemezler.
                </li>
              )}
              {result.results.some((r) => r.errorKind === "auth") && (
                <li><strong>Auth hatası:</strong> Bir veya birden fazla API anahtarı geçersiz / yetkisiz.</li>
              )}
              {result.results.some((r) => r.errorKind === "rate_limit") && (
                <li><strong>Rate limit:</strong> Provider kotası aşıldı, bir süre bekleyin.</li>
              )}
              {result.results.every((r) => r.resultsCount === 0) && (
                <li><strong>Hiçbir provider sonuç vermedi.</strong> Sorgu çok spesifik olabilir veya tüm provider'lar yapılandırma/erişim sorunu yaşıyor.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
