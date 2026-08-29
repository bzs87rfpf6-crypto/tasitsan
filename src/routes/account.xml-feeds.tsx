import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, Play, Pause, AlertCircle, ChevronLeft, Upload, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { translateError } from "@/lib/error-messages";
import { supabase } from "@/integrations/supabase/client";
import {
  createXmlFeed,
  createXmlFeedFromFile,
  createXmlUploadUrl,
  exportXmlRunErrorsCsv,
  listMyXmlFeeds,
  deleteXmlFeed,
  updateXmlFeed,
  runXmlFeedNow,
  listMyXmlRuns,
  previewXmlFeed,
} from "@/lib/xml-feeds.functions";


export const Route = createFileRoute("/account/xml-feeds")({
  head: () => ({ meta: [{ title: "XML Entegrasyonları — Taşıtsan" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: XmlFeedsPage,
});

interface FeedRow {
  id: string;
  name: string;
  url: string | null;
  status: string;
  sync_interval: string;
  missing_item_action: string;
  last_sync_at: string | null;
  last_status: string | null;
  last_error: string | null;
  total_products: number;
  consecutive_failures: number;
  rejection_reason: string | null;
  source_type?: string;
  uploaded_path?: string | null;
}


const INTERVALS = [
  { value: "manual", label: "Manuel" },
  { value: "15min", label: "15 dakika" },
  { value: "30min", label: "30 dakika" },
  { value: "1h", label: "1 saat" },
  { value: "6h", label: "6 saatte bir" },
  { value: "12h", label: "12 saatte bir" },
  { value: "daily", label: "Günlük" },
  { value: "weekly", label: "Haftalık" },
] as const;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: "Onay bekliyor", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  active: { label: "Aktif", cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  paused: { label: "Duraklatıldı", cls: "text-muted-foreground border-border bg-muted/30" },
  disabled: { label: "Kapatıldı", cls: "text-muted-foreground border-border bg-muted/30" },
  rejected: { label: "Reddedildi", cls: "text-destructive border-destructive/40 bg-destructive/10" },
};

function XmlFeedsPage() {
  const { user, loading: authLoading } = useAuth();
  const list = useServerFn(listMyXmlFeeds);
  const create = useServerFn(createXmlFeed);
  const remove = useServerFn(deleteXmlFeed);
  const update = useServerFn(updateXmlFeed);
  const runNow = useServerFn(runXmlFeedNow);
  const listRuns = useServerFn(listMyXmlRuns);
  const createFromFile = useServerFn(createXmlFeedFromFile);
  const createUploadUrl = useServerFn(createXmlUploadUrl);
  const exportErrors = useServerFn(exportXmlRunErrorsCsv);

  const [feeds, setFeeds] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [openRunsId, setOpenRunsId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, Array<Record<string, unknown>>>>({});

  // Form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", sync_interval: "daily" as string, missing_item_action: "set_zero" as string });
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preview = useServerFn(previewXmlFeed);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<null | {
    source: string;
    size_bytes: number;
    stats: { total: number; brands: number; oems: number; images: number; with_price: number; with_image: number; missing_data: number; errors: number };
    sample: Array<{ title: string; brand: string | null; oem: string | null; oem_count: number; price: number | null; stock: number; image: string | null }>;
    first_errors: Array<{ index: number; reason: string }>;
  }>(null);
  const [lastUploadedPath, setLastUploadedPath] = useState<string | null>(null);

  async function runPreview(opts: { url?: string; uploaded_path?: string }) {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const res = await preview({ data: opts });
      setPreviewResult({
        source: res.source,
        size_bytes: res.size_bytes,
        stats: res.stats,
        sample: res.sample,
        first_errors: res.first_errors,
      });
      toast.success(`${res.stats.total} ürün bulundu`);
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setPreviewing(false);
    }
  }


  async function load() {
    setLoading(true);
    try {
      const res = await list();
      setFeeds(res.feeds as unknown as FeedRow[]);
    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (user) void load(); }, [user]);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await create({ data: form as { name: string; url: string; sync_interval: "hourly" | "6h" | "12h" | "daily" | "weekly"; missing_item_action: "set_zero" | "deactivate" | "ignore"; template?: "generic" } });
      toast.success("XML kaydedildi. Yönetici onayından sonra aktifleşecek.");
      setForm({ name: "", url: "", sync_interval: "daily", missing_item_action: "set_zero" });
      setShowForm(false);
      void load();
    } catch (e) {
      toast.error(translateError(e, "XML kaydedilemedi"));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteFeed(id: string) {
    if (!confirm("Bu XML kaydını silmek istiyor musunuz? Daha önce içe aktarılan ürünler silinmez.")) return;
    try { await remove({ data: { id } }); toast.success("Silindi."); void load(); }
    catch (e) { toast.error(translateError(e)); }
  }

  async function togglePause(f: FeedRow) {
    const next = f.status === "active" ? "paused" : "active";
    try { await update({ data: { id: f.id, status: next as "active" | "paused" } }); void load(); }
    catch (e) { toast.error(translateError(e)); }
  }

  async function syncNow(id: string) {
    setRunningId(id);
    try {
      const res = await runNow({ data: { id } });
      toast.success(`Sync tamamlandı: +${res.result.items_added} eklendi, ${res.result.items_updated} güncellendi, ${res.result.items_deactivated} pasif`);
      void load();
    } catch (e) {
      toast.error(translateError(e, "Sync başarısız"));
    } finally { setRunningId(null); }
  }

  async function toggleRuns(id: string) {
    if (openRunsId === id) { setOpenRunsId(null); return; }
    setOpenRunsId(id);
    if (!runs[id]) {
      try {
        const r = await listRuns({ data: { feed_id: id, limit: 10 } });
        setRuns((prev) => ({ ...prev, [id]: r.runs as unknown as Array<Record<string, unknown>> }));
      } catch (e) { toast.error(translateError(e)); }
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const namePart = file.name.replace(/\.(xml\.gz|xml|gz|zip)$/i, "");
      const { path, token } = await createUploadUrl({ data: { filename: file.name } });
      const { error: upErr } = await supabase.storage
        .from("xml-uploads")
        .uploadToSignedUrl(path, token, file, { contentType: file.type || "application/xml" });
      if (upErr) throw upErr;
      const res = await createFromFile({
        data: {
          name: namePart || file.name,
          uploaded_path: path,
          missing_item_action: form.missing_item_action as "set_zero" | "deactivate" | "ignore",
          template: "generic",
        },
      });
      toast.success("Dosya yüklendi. Yönetici onayından sonra içe aktarılabilir.");
      setLastUploadedPath(path);
      void runPreview({ uploaded_path: path });
      setShowForm(false);
      void load();
      return res;
    } catch (e) {
      toast.error(translateError(e, "Dosya yüklenemedi"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function downloadErrorsCsv(runId: string) {
    try {
      const { csv, filename } = await exportErrors({ data: { run_id: runId } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(translateError(e, "CSV indirilemedi"));
    }
  }


  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-6 animate-spin text-gold" /></div>;
  }
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p>Bu sayfaya erişmek için <Link to="/auth" className="text-gold underline">giriş yapın</Link>.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/account" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-gold">
              <ChevronLeft className="size-3" /> Hesabım
            </Link>
            <h1 className="font-display text-xl text-gold mt-1">XML Entegrasyonları</h1>
            <p className="text-xs text-muted-foreground">XML URL'lerinizi bağlayın, ürünleriniz otomatik senkron edilsin.</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="h-9 px-3 rounded-lg text-xs font-semibold bg-gold-gradient text-gold-foreground inline-flex items-center gap-1.5 shadow-gold">
            <Plus className="size-3.5" /> Yeni XML
          </button>
        </div>

        {showForm && (
          <form onSubmit={submitNew} className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-3 text-xs">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ad</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ana Tedarikçi XML" className="w-full h-9 px-2.5 rounded-md bg-card border border-border" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">XML Adresi</label>
              <div className="flex gap-1.5">
                <input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://firma.com/urunler.xml" className="flex-1 h-9 px-2.5 rounded-md bg-card border border-border font-mono text-[11px]" />
                <button type="button" disabled={!form.url || previewing}
                  onClick={() => void runPreview({ url: form.url })}
                  className="h-9 px-2.5 rounded-md border border-gold/40 text-[11px] inline-flex items-center gap-1 hover:bg-gold/10 disabled:opacity-40">
                  {previewing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Test Et
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sıklık</label>
                <select value={form.sync_interval} onChange={(e) => setForm({ ...form, sync_interval: e.target.value })}
                  className="w-full h-9 px-2 rounded-md bg-card border border-border">
                  {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Kayıp ürün</label>
                <select value={form.missing_item_action} onChange={(e) => setForm({ ...form, missing_item_action: e.target.value })}
                  className="w-full h-9 px-2 rounded-md bg-card border border-border">
                  <option value="set_zero">Stok 0 yap</option>
                  <option value="deactivate">Pasife al</option>
                  <option value="ignore">Hiçbir şey yapma</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="h-9 px-3 rounded-md border border-border text-xs">Vazgeç</button>
              <button type="submit" disabled={submitting} className="h-9 px-3 rounded-md bg-gold-gradient text-gold-foreground text-xs font-semibold disabled:opacity-50">
                {submitting ? "Test ediliyor…" : "Kaydet"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Kayıt sonrası URL'ye bağlantı testi yapılır. Yönetici onayından sonra otomatik senkron başlar.</p>

            <div className="border-t border-border/50 pt-3 mt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">veya dosya yükle (.xml / .xml.gz / .zip)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.gz,.zip,application/xml,text/xml,application/gzip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-full h-9 px-3 rounded-md border border-dashed border-gold/40 text-xs inline-flex items-center justify-center gap-1.5 hover:bg-gold/5 disabled:opacity-50">
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {uploading ? "Yükleniyor…" : "XML Dosyası Yükle"}
              </button>
              <p className="text-[10px] text-muted-foreground mt-1">Maks. 25 MB. Onay sonrası "Sync" butonuyla içe aktarılır.</p>
            </div>
          </form>
        )}

        {previewResult && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <p className="font-display text-sm text-emerald-300">📊 XML Önizleme</p>
              <button type="button" onClick={() => setPreviewResult(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Kapat ✕</button>
            </div>
            <p className="text-[10px] text-muted-foreground truncate font-mono">{previewResult.source} · {(previewResult.size_bytes / 1024).toFixed(1)} KB</p>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { k: "Ürün", v: previewResult.stats.total, cls: "text-emerald-300" },
                { k: "OEM", v: previewResult.stats.oems, cls: "text-gold" },
                { k: "Resimli", v: previewResult.stats.with_image, cls: "text-sky-300" },
                { k: "Fiyatlı", v: previewResult.stats.with_price, cls: "text-emerald-300" },
                { k: "Marka", v: previewResult.stats.brands, cls: "text-muted-foreground" },
                { k: "Görsel toplam", v: previewResult.stats.images, cls: "text-muted-foreground" },
                { k: "Eksik veri", v: previewResult.stats.missing_data, cls: "text-amber-300" },
                { k: "Hatalı satır", v: previewResult.stats.errors, cls: previewResult.stats.errors ? "text-destructive" : "text-muted-foreground" },
              ].map((s) => (
                <div key={s.k} className="rounded border border-border bg-background/40 p-1.5">
                  <div className={`font-display text-base ${s.cls}`}>{s.v}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
                </div>
              ))}
            </div>
            {previewResult.sample.length > 0 && (
              <details className="border-t border-border/40 pt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">İlk {previewResult.sample.length} ürün</summary>
                <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                  {previewResult.sample.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] border-b border-border/30 pb-1">
                      {s.image ? <img src={s.image} alt="" className="size-8 rounded object-cover bg-muted" loading="lazy" /> : <div className="size-8 rounded bg-muted/40" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="truncate text-muted-foreground font-mono">{s.brand ?? "—"} · {s.oem ?? "—"}{s.oem_count > 1 ? ` +${s.oem_count - 1}` : ""}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p>{s.price != null ? `${s.price}₺` : "—"}</p>
                        <p className="text-muted-foreground">stk {s.stock}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {previewResult.first_errors.length > 0 && (
              <details className="border-t border-border/40 pt-2">
                <summary className="cursor-pointer text-[11px] text-destructive">İlk {previewResult.first_errors.length} hata</summary>
                <ul className="mt-1 space-y-0.5 text-[10px] font-mono text-destructive/80">
                  {previewResult.first_errors.map((e, i) => <li key={i}>#{e.index}: {e.reason}</li>)}
                </ul>
              </details>
            )}
            {lastUploadedPath && <p className="text-[10px] text-muted-foreground">Dosya yolu: <span className="font-mono">{lastUploadedPath}</span></p>}
          </div>
        )}




        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="size-5 animate-spin text-gold" /></div>
        ) : feeds.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Henüz XML entegrasyonunuz yok. "Yeni XML" ile ekleyin.
          </div>
        ) : feeds.map((f) => {
          const s = STATUS_LABEL[f.status] ?? STATUS_LABEL.disabled;
          const isOpen = openRunsId === f.id;
          return (
            <div key={f.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {f.source_type === "file" ? `📄 ${f.uploaded_path?.split("/").pop() ?? "Yüklenmiş dosya"}` : f.url}
                  </p>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${s.cls} uppercase tracking-wider shrink-0`}>{s.label}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>Sıklık: <b className="text-foreground">{INTERVALS.find((i) => i.value === f.sync_interval)?.label}</b></span>
                <span>· Toplam: <b className="text-foreground">{f.total_products}</b></span>
                {f.last_sync_at && <span>· Son: <b className="text-foreground">{new Date(f.last_sync_at).toLocaleString("tr-TR")}</b></span>}
                {f.consecutive_failures > 0 && <span className="text-destructive inline-flex items-center gap-1"><AlertCircle className="size-3" /> {f.consecutive_failures} ardışık hata</span>}
              </div>
              {f.last_error && <p className="text-[11px] text-destructive">{f.last_error}</p>}
              {f.rejection_reason && <p className="text-[11px] text-destructive">Red sebebi: {f.rejection_reason}</p>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(f.status === "active" || f.status === "paused") && (
                  <button onClick={() => syncNow(f.id)} disabled={runningId === f.id || f.status !== "active"}
                    className="h-8 px-2.5 rounded-md text-[11px] bg-gold-gradient text-gold-foreground font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                    {runningId === f.id ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Sync
                  </button>
                )}
                {(f.status === "active" || f.status === "paused") && (
                  <button onClick={() => togglePause(f)} className="h-8 px-2.5 rounded-md text-[11px] border border-border inline-flex items-center gap-1">
                    {f.status === "active" ? <><Pause className="size-3" /> Duraklat</> : <><Play className="size-3" /> Devam</>}
                  </button>
                )}
                <button onClick={() => toggleRuns(f.id)} className="h-8 px-2.5 rounded-md text-[11px] border border-border">
                  {isOpen ? "Geçmişi gizle" : "Sync geçmişi"}
                </button>
                <button onClick={() => deleteFeed(f.id)} className="h-8 px-2.5 rounded-md text-[11px] border border-destructive/40 text-destructive inline-flex items-center gap-1">
                  <Trash2 className="size-3" /> Sil
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-border pt-2 mt-1 space-y-1.5 max-h-64 overflow-y-auto">
                  {(runs[f.id] ?? []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Henüz sync çalışmadı.</p>
                  ) : (runs[f.id] ?? []).map((r) => {
                    const rr = r as { id: string; status: string; started_at: string; items_added: number; items_updated: number; items_deactivated: number; items_failed: number; error: string | null; duration_ms: number };
                    return (
                      <div key={rr.id} className="text-[11px] flex flex-wrap gap-x-2 gap-y-0.5 border-b border-border/50 pb-1">
                        <span className={
                          rr.status === "success" ? "text-emerald-400" :
                          rr.status === "partial" ? "text-amber-400" :
                          rr.status === "failed" ? "text-destructive" : "text-muted-foreground"
                        }>{rr.status}</span>
                        <span className="text-muted-foreground">{new Date(rr.started_at).toLocaleString("tr-TR")}</span>
                        <span>+{rr.items_added} / ↻{rr.items_updated} / ⊘{rr.items_deactivated} / ✕{rr.items_failed}</span>
                        <span className="text-muted-foreground">{rr.duration_ms}ms</span>
                        {rr.items_failed > 0 && (
                          <button onClick={() => downloadErrorsCsv(rr.id)} className="text-gold inline-flex items-center gap-0.5 hover:underline">
                            <Download className="size-3" /> Hata CSV
                          </button>
                        )}
                        {rr.error && <span className="text-destructive w-full">{rr.error}</span>}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
