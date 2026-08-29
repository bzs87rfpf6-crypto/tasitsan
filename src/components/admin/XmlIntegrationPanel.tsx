import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileCode2, RefreshCw, Check, X, Pause, Play, AlertCircle } from "lucide-react";
import { translateError } from "@/lib/error-messages";
import {
  adminListXmlFeeds,
  adminApproveXmlFeed,
  adminRejectXmlFeed,
  adminToggleXmlFeed,
  adminXmlOverview,
  adminRecentXmlRuns,
  adminXmlDiagnostics,
} from "@/lib/xml-feeds-admin.functions";

interface Overview {
  active: number;
  pending: number;
  paused: number;
  failed_last24h: number;
  runs_last24h: number;
  items_imported_last24h: number;
  top_feeds: Array<{ id: string; name: string; seller_name: string | null; total_products: number; last_status: string | null }>;
}

export function XmlIntegrationPanel() {
  const list = useServerFn(adminListXmlFeeds);
  const approve = useServerFn(adminApproveXmlFeed);
  const reject = useServerFn(adminRejectXmlFeed);
  const toggle = useServerFn(adminToggleXmlFeed);
  const ovFn = useServerFn(adminXmlOverview);
  const runsFn = useServerFn(adminRecentXmlRuns);
  const diagnosticsFn = useServerFn(adminXmlDiagnostics);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [feeds, setFeeds] = useState<Array<Record<string, unknown>>>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [tab, setTab] = useState<"pending_approval" | "active" | "all">("pending_approval");
  const [loading, setLoading] = useState(false);
  // Debug info — only rendered in dev or when admin toggles Debug Mode (?xmlDebug=1 or localStorage.xml_debug=1)
  const [debug, setDebug] = useState<{ overview?: string; feeds?: string; runs?: string; ts?: string }>({});
  const [diagnostics, setDiagnostics] = useState<Array<Record<string, unknown>>>([]);
  const [debugMode, setDebugMode] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search).get("xmlDebug");
    if (qs === "1") { localStorage.setItem("xml_debug", "1"); setDebugMode(true); return; }
    if (qs === "0") { localStorage.removeItem("xml_debug"); setDebugMode(false); return; }
    setDebugMode(import.meta.env.DEV || localStorage.getItem("xml_debug") === "1");
  }, []);

  async function load() {
    setLoading(true);
    const ts = new Date().toLocaleTimeString("tr-TR");
    const [o, f, r, d] = await Promise.allSettled([
      ovFn(),
      list({ data: { status: tab } }),
      runsFn(),
      debugMode ? diagnosticsFn() : Promise.resolve({ checks: [] }),
    ]);
    const dbg: { overview?: string; feeds?: string; runs?: string; ts?: string } = { ts };
    if (o.status === "fulfilled") {
      setOverview(((o.value as { overview: unknown }).overview as Overview | null) ?? null);
      dbg.overview = "ok";
    } else {
      const msg = o.reason instanceof Error ? o.reason.message : String(o.reason);
      dbg.overview = msg;
      console.error("[XML] adminXmlOverview failed:", o.reason);
    }
    if (f.status === "fulfilled") {
      setFeeds(((f.value as { feeds: unknown[] }).feeds ?? []) as Array<Record<string, unknown>>);
      dbg.feeds = "ok";
    } else {
      const msg = f.reason instanceof Error ? f.reason.message : String(f.reason);
      dbg.feeds = msg;
      console.error("[XML] adminListXmlFeeds failed:", f.reason);
    }
    if (r.status === "fulfilled") {
      setRuns(((r.value as { runs: unknown[] }).runs ?? []) as Array<Record<string, unknown>>);
      dbg.runs = "ok";
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      dbg.runs = msg;
      console.error("[XML] adminRecentXmlRuns failed:", r.reason);
    }
    if (d.status === "fulfilled") {
      setDiagnostics(((d.value as { checks: unknown[] }).checks ?? []) as Array<Record<string, unknown>>);
      console.table(((d.value as { checks: unknown[] }).checks ?? []).map((x) => x as Record<string, unknown>));
    } else {
      setDiagnostics([{ name: "adminXmlDiagnostics server function", ok: false, http_status: null, error: d.reason instanceof Error ? d.reason.message : String(d.reason) }]);
      console.error("[XML] adminXmlDiagnostics failed:", d.reason);
    }
    setDebug(dbg);
    const failed = [o, f, r].filter((x) => x.status === "rejected").length;
    if (failed === 3) {
      // All three failed → likely auth/role issue; surface real cause
      const first = [o, f, r].find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
      toast.error(translateError(first?.reason));
    } else if (failed > 0) {
      toast.warning(`${failed} XML servisinden veri alınamadı.`);
    }
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  async function doApprove(id: string) {
    try { await approve({ data: { id } }); toast.success("Onaylandı."); void load(); }
    catch (e) { toast.error(translateError(e)); }
  }
  async function doReject(id: string) {
    const reason = prompt("Red sebebi:");
    if (!reason || reason.trim().length < 3) return;
    try { await reject({ data: { id, reason: reason.trim() } }); toast.success("Reddedildi."); void load(); }
    catch (e) { toast.error(translateError(e)); }
  }
  async function doToggle(id: string, status: "active" | "paused" | "disabled") {
    try { await toggle({ data: { id, status } }); void load(); }
    catch (e) { toast.error(translateError(e)); }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-display text-base inline-flex items-center gap-2">
            <FileCode2 className="size-4 text-gold" /> XML Yönetim Merkezi
          </h2>
          <p className="text-[11px] text-muted-foreground">Tedarikçi XML entegrasyonları, onaylar ve senkron geçmişi.</p>
        </div>
        <button onClick={load} disabled={loading} className="h-8 px-2.5 rounded-md border border-border text-xs inline-flex items-center gap-1 disabled:opacity-50">
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Yenile
        </button>
      </header>

      {overview && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
          {[
            { k: "Aktif", v: overview.active, cls: "text-emerald-400" },
            { k: "Bekliyor", v: overview.pending, cls: "text-amber-400" },
            { k: "Duraklatıldı", v: overview.paused, cls: "text-muted-foreground" },
            { k: "24s sync", v: overview.runs_last24h, cls: "text-gold" },
            { k: "24s hata", v: overview.failed_last24h, cls: "text-destructive" },
            { k: "24s ürün", v: overview.items_imported_last24h, cls: "text-gold" },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-border bg-background/40 p-2">
              <div className={`font-display text-lg ${s.cls}`}>{s.v}</div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
            </div>
          ))}
        </div>
      )}

      {debugMode && (debug.overview || debug.feeds || debug.runs) && (debug.overview !== "ok" || debug.feeds !== "ok" || debug.runs !== "ok") && (
        <details open className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
          <summary className="cursor-pointer text-amber-300 font-semibold">🔍 Debug — son istek {debug.ts}</summary>
          <ul className="mt-1 space-y-0.5 font-mono">
            <li><span className={debug.overview === "ok" ? "text-emerald-400" : "text-destructive"}>overview:</span> {debug.overview ?? "—"}</li>
            <li><span className={debug.feeds === "ok" ? "text-emerald-400" : "text-destructive"}>feeds:</span> {debug.feeds ?? "—"} ({feeds.length} kayıt)</li>
            <li><span className={debug.runs === "ok" ? "text-emerald-400" : "text-destructive"}>runs:</span> {debug.runs ?? "—"} ({runs.length} kayıt)</li>
          </ul>
        </details>
      )}

      {debugMode && diagnostics.length > 0 && (
        <details open className="rounded-lg border border-border bg-background/50 p-2 text-[11px]">
          <summary className="cursor-pointer font-semibold text-gold">Server Function / RPC Tanı Çıktıları</summary>
          <div className="mt-2 space-y-2">
            {diagnostics.map((check, index) => {
              const ok = check.ok === true;
              return (
                <div key={`${String(check.name ?? "check")}-${index}`} className="rounded-md border border-border bg-card/50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={ok ? "text-emerald-400" : "text-destructive"}>{String(check.name ?? "Bilinmeyen çağrı")}</span>
                    <span className="font-mono text-muted-foreground">HTTP {String(check.http_status ?? "—")}</span>
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/70 p-2 font-mono text-[10px] text-muted-foreground">
                    {JSON.stringify(check, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="flex items-center gap-1.5 text-xs">
        {(["pending_approval", "active", "all"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded border ${tab === t ? "bg-gold/15 text-gold border-gold/40" : "border-border hover:bg-muted"}`}>
            {t === "pending_approval" ? "Onay bekleyen" : t === "active" ? "Aktif" : "Tümü"}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {feeds.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Kayıt yok.</p>}
        {feeds.map((row) => {
          const f = row as {
            id: string; name: string; url: string; status: string; total_products: number;
            last_sync_at: string | null; last_status: string | null; last_error: string | null;
            consecutive_failures: number; rejection_reason: string | null;
            profiles?: { display_name?: string | null } | null;
          };
          return (
            <div key={f.id} className="rounded-lg border border-border bg-background/30 p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {f.profiles?.display_name ?? "—"} · <span className="font-mono">{f.url}</span>
                  </p>
                  {f.last_error && <p className="text-[10px] text-destructive mt-1 inline-flex items-center gap-1"><AlertCircle className="size-3" /> {f.last_error}</p>}
                  {f.rejection_reason && <p className="text-[10px] text-destructive mt-1">Red: {f.rejection_reason}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{f.status}</span>
                  <span className="text-[10px]">{f.total_products} ürün</span>
                </div>
              </div>
              <div className="flex gap-1 pt-2 flex-wrap">
                {f.status === "pending_approval" && (
                  <>
                    <button onClick={() => doApprove(f.id)} className="h-7 px-2 rounded text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1"><Check className="size-3" /> Onayla</button>
                    <button onClick={() => doReject(f.id)} className="h-7 px-2 rounded text-[11px] border border-destructive/40 text-destructive inline-flex items-center gap-1"><X className="size-3" /> Reddet</button>
                  </>
                )}
                {f.status === "active" && (
                  <button onClick={() => doToggle(f.id, "paused")} className="h-7 px-2 rounded text-[11px] border border-border inline-flex items-center gap-1"><Pause className="size-3" /> Duraklat</button>
                )}
                {f.status === "paused" && (
                  <button onClick={() => doToggle(f.id, "active")} className="h-7 px-2 rounded text-[11px] border border-border inline-flex items-center gap-1"><Play className="size-3" /> Aktifleştir</button>
                )}
                {(f.status === "active" || f.status === "paused") && (
                  <button onClick={() => doToggle(f.id, "disabled")} className="h-7 px-2 rounded text-[11px] border border-destructive/40 text-destructive">Kapat</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {runs.length > 0 && (
        <details className="border-t border-border pt-2">
          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">Son 25 sync çalışması</summary>
          <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {runs.map((row) => {
              const r = row as { id: string; status: string; started_at: string; items_added: number; items_updated: number; items_deactivated: number; items_failed: number; xml_feeds: { name?: string } | null };
              return (
                <div key={r.id} className="text-[11px] flex flex-wrap gap-x-2 border-b border-border/30 pb-1">
                  <span className={r.status === "success" ? "text-emerald-400" : r.status === "partial" ? "text-amber-400" : r.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{r.status}</span>
                  <span>{r.xml_feeds?.name ?? "?"}</span>
                  <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString("tr-TR")}</span>
                  <span>+{r.items_added} / ↻{r.items_updated} / ⊘{r.items_deactivated} / ✕{r.items_failed}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
