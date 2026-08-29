import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Trash2, UserPlus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/admin/StatCard";
import { SignupFunnelPanel } from "@/components/admin/SignupFunnelPanel";
import { translateError } from "@/lib/error-messages";
import {
  listSignupFailures,
  getSignupFailuresStats,
  updateSignupFailureStatus,
  deleteSignupFailure,
  adminCreateUserFromFailure,
} from "@/lib/signup-failures.functions";

type Status = "pending" | "resolved" | "converted" | "dismissed";

interface FailureRow {
  id: string;
  created_at: string;
  status: Status;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  error_code: string | null;
  error_message: string | null;
  ip: string | null;
  user_agent: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  form_data: Record<string, unknown> | null;
  attempt_count: number;
  created_user_id: string | null;
  admin_notes: string | null;
}


interface Stats {
  pending: number; resolved: number; last_24h: number; last_7d: number;
  total: number; converted: number;
  top_errors: { error_code: string; count: number }[];
}
interface Report {
  days: number; success: number; failed: number; total: number;
  success_rate: number; top_error: string | null;
}
interface Alert { error_code: string; occurrences: number; last_at: string }

const STATUS_LABEL: Record<Status, string> = {
  pending: "Bekleyen",
  resolved: "Çözülen",
  converted: "Kullanıcı Oluşturuldu",
  dismissed: "Yok Sayıldı",
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString("tr-TR"); } catch { return s; }
}

export function SignupFailuresPanel() {
  const listFn = useServerFn(listSignupFailures);
  const statsFn = useServerFn(getSignupFailuresStats);
  const updateFn = useServerFn(updateSignupFailureStatus);
  const deleteFn = useServerFn(deleteSignupFailure);
  const createFn = useServerFn(adminCreateUserFromFailure);

  const [rows, setRows] = useState<FailureRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<FailureRow | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        listFn({ data: { status: statusFilter, search: search || null, limit: 200 } }),
        statsFn(),
      ]);
      setRows(l.rows as FailureRow[]);
      setStats(s.stats as unknown as Stats);
      setAlerts(s.alerts as unknown as Alert[]);
      setReport(s.report as unknown as Report);

    } catch (e) {
      toast.error(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [statusFilter]);

  const filtered = useMemo(() => rows, [rows]);

  async function handleStatus(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    try {
      await updateFn({ data: { id, status } });
      toast.success("Güncellendi");
      await refresh();
    } catch (e) {
      toast.error(translateError(e));
    } finally { setBusy(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu kaydı kalıcı olarak silmek istediğine emin misin?")) return;
    setBusy(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("Silindi");
      await refresh();
    } catch (e) {
      toast.error(translateError(e));
    } finally { setBusy(null); }
  }

  async function handleCreateUser(r: FailureRow) {
    const name = r.display_name || (r.form_data?.name as string) || "Yeni kullanıcı";
    if (!confirm(`"${name}" için kullanıcı oluşturulsun mu?\n\nE-posta varsa şifre belirleme bağlantısı gönderilecek.`)) return;
    setBusy(r.id);
    try {
      const res = await createFn({
        data: {
          id: r.id,
          email: r.email,
          phone: r.phone,
          displayName: name,
          sendResetEmail: true,
          approve: true,
        },
      });
      toast.success(res.emailSent ? "Kullanıcı oluşturuldu, şifre maili gönderildi" : "Kullanıcı oluşturuldu");
      setDetail(null);
      await refresh();
    } catch (e) {
      toast.error(translateError(e));
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      {/* Signup funnel (view → start → submit → success) */}
      <SignupFunnelPanel />

      {/* Critical alarms */}
      {alerts.length > 0 && (
        <div className="rounded-xl border-2 border-red-500/60 bg-red-500/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
            <AlertTriangle className="size-4" /> KRİTİK ALARM — son 1 saatte tekrarlayan hatalar
          </div>
          {alerts.map((a) => (
            <div key={a.error_code} className="text-xs text-red-200">
              <span className="font-mono">{a.error_code}</span> — <b>{a.occurrences}</b> kez (son: {fmtDate(a.last_at)})
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <StatCard icon={<AlertTriangle className="size-3" />} label="Bekleyen" value={stats.pending} />
          <StatCard icon={<CheckCircle2 className="size-3" />} label="Çözülen" value={stats.resolved} />
          <StatCard icon={<RefreshCw className="size-3" />} label="Son 24s" value={stats.last_24h} />
          <StatCard icon={<RefreshCw className="size-3" />} label="Son 7g" value={stats.last_7d} />
          <StatCard icon={<AlertTriangle className="size-3" />} label="Toplam" value={stats.total} />
          <StatCard icon={<UserPlus className="size-3" />} label="Üye Oluşturuldu" value={stats.converted} />
        </div>
      )}


      {/* Conversion report */}
      {report && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-2">Kayıt Dönüşüm Raporu (son {report.days} gün)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div><div className="text-muted-foreground text-[11px]">Başarılı</div><div className="font-bold text-emerald-400">{report.success}</div></div>
            <div><div className="text-muted-foreground text-[11px]">Başarısız</div><div className="font-bold text-red-400">{report.failed}</div></div>
            <div><div className="text-muted-foreground text-[11px]">Başarı Oranı</div><div className="font-bold text-gold">%{report.success_rate}</div></div>
            <div><div className="text-muted-foreground text-[11px]">En Sık Hata</div><div className="font-mono text-xs">{report.top_error ?? "—"}</div></div>
          </div>
        </div>
      )}

      {/* Top errors */}
      {stats && stats.top_errors.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-2">En sık alınan hatalar (30g)</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.top_errors.map((e) => (
              <span key={e.error_code} className="text-[11px] px-2 py-1 rounded bg-muted font-mono">
                {e.error_code} · <b>{e.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "pending", "resolved", "converted", "dismissed"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                statusFilter === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
              }`}>
              {s === "all" ? "Tümü" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void refresh(); }}
            placeholder="E-posta, telefon, hata kodu..." className="pl-9 h-9 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {r.display_name || r.email || r.phone || "(bilinmeyen)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{fmtDate(r.created_at)}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.email || "—"} • {r.phone || "—"} {r.company_name ? `• ${r.company_name}` : ""}
                  </div>
                  {(r.city || r.country) && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      📍 {[r.city, r.region, r.country].filter(Boolean).join(", ")}
                    </div>
                  )}

                </div>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
                  r.status === "pending" ? "bg-amber-500/20 text-amber-300" :
                  r.status === "converted" ? "bg-emerald-500/20 text-emerald-300" :
                  r.status === "resolved" ? "bg-blue-500/20 text-blue-300" :
                  "bg-muted text-muted-foreground"
                }`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div className="text-xs">
                <span className="font-mono text-red-300">{r.error_code || "(kod yok)"}</span>
                {r.error_message && <span className="text-muted-foreground"> — {r.error_message}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDetail(r)}>
                  Detay
                </Button>
                {r.status !== "converted" && (
                  <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                    disabled={busy === r.id} onClick={() => handleCreateUser(r)}>
                    <UserPlus className="size-3 mr-1" /> Kullanıcıyı Oluştur
                  </Button>
                )}
                {r.status === "pending" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    disabled={busy === r.id} onClick={() => handleStatus(r.id, "resolved")}>
                    <CheckCircle2 className="size-3 mr-1" /> Çözüldü
                  </Button>
                )}
                {r.status !== "dismissed" && r.status !== "converted" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    disabled={busy === r.id} onClick={() => handleStatus(r.id, "dismissed")}>
                    Yok say
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-400"
                  disabled={busy === r.id} onClick={() => handleDelete(r.id)}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Hata Detayı</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-xs">
              <div><b>Tarih:</b> {fmtDate(detail.created_at)}</div>
              <div><b>Durum:</b> {STATUS_LABEL[detail.status]}</div>
              <div><b>Ad:</b> {detail.display_name || "—"}</div>
              <div><b>E-posta:</b> {detail.email || "—"}</div>
              <div><b>Telefon:</b> {detail.phone || "—"}</div>
              <div><b>Firma:</b> {detail.company_name || "—"}</div>
              <div><b>Hata Kodu:</b> <span className="font-mono">{detail.error_code || "—"}</span></div>
              <div><b>Hata Mesajı:</b> {detail.error_message || "—"}</div>
              <div><b>IP:</b> <span className="font-mono">{detail.ip || "—"}</span></div>
              <div><b>Konum:</b> {[detail.city, detail.region, detail.country].filter(Boolean).join(", ") || "—"}</div>
              <div><b>Tarayıcı:</b> <span className="break-all">{detail.user_agent || "—"}</span></div>

              <div>
                <b>Form verisi:</b>
                <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-auto max-h-40">
{JSON.stringify(detail.form_data, null, 2)}
                </pre>
              </div>
              {detail.created_user_id && (
                <div className="text-emerald-400"><b>Oluşturulan kullanıcı:</b> {detail.created_user_id}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
