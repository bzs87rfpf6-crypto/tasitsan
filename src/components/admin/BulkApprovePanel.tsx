import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPendingReport,
  bulkApprovePending,
  type PendingReport,
  type BulkApproveResult,
} from "@/lib/bulk-approve.functions";
import { translateError } from "@/lib/error-messages";

const fmt = (n: number) => n.toLocaleString("tr-TR");

export function BulkApprovePanel({ onChanged }: { onChanged?: () => void } = {}) {
  const fetchReport = useServerFn(getPendingReport);
  const approve = useServerFn(bulkApprovePending);
  const [report, setReport] = useState<PendingReport | null>(null);
  const [result, setResult] = useState<BulkApproveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setReport(await fetchReport());
    } catch (e) {
      setErr(translateError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onApprove() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await approve({ data: {} });
      setResult(r);
      setConfirm(false);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(translateError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg">Toplu Onay</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Bekleyen ilanları tek seferde onaylayın. Eksik fiyat veya OEM kodu olanlar atlanır.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading || busy}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </header>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Stat label="Bekleyen toplam" value={fmt(report.total)} />
            <Stat label="Onaylanabilir" value={fmt(report.eligible)} tone="ok" />
            <Stat label="Eksik fiyat" value={fmt(report.missingPrice)} tone={report.missingPrice ? "warn" : undefined} />
            <Stat label="Eksik OEM" value={fmt(report.missingOem)} tone={report.missingOem ? "warn" : undefined} />
            <Stat label="Atlanacak" value={fmt(report.ineligible)} tone={report.ineligible ? "warn" : undefined} />
          </div>

          {report.duplicateOemGroups.length > 0 && (
            <details className="mb-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Mükerrer OEM kayıtları ({report.duplicateOemGroups.length})
              </summary>
              <ul className="mt-2 space-y-1 ml-4 text-xs">
                {report.duplicateOemGroups.map((g) => (
                  <li key={g.oem} className="flex justify-between gap-3">
                    <code className="text-gold">{g.oem}</code>
                    <span className="text-muted-foreground">{g.count} ilan</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!confirm ? (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy || report.eligible === 0}
              className="rounded-md bg-gold-gradient px-4 py-2.5 text-sm font-semibold text-gold-foreground shadow-gold disabled:opacity-50"
            >
              {report.eligible > 0
                ? `${fmt(report.eligible)} ilanı onayla`
                : "Onaylanacak ilan yok"}
            </button>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm mb-3">
                <strong>{fmt(report.eligible)}</strong> ilan onaylanacak, <strong>{fmt(report.ineligible)}</strong> ilan
                eksik bilgi nedeniyle atlanacak. Devam edilsin mi?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onApprove}
                  disabled={busy}
                  className="rounded-md bg-gold-gradient px-4 py-2 text-sm font-semibold text-gold-foreground shadow-gold disabled:opacity-50"
                >
                  {busy ? "Onaylanıyor…" : "Evet, onayla"}
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  disabled={busy}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm space-y-1">
          <div>✅ <strong>{fmt(result.approved)}</strong> ilan onaylandı.</div>
          <div>⏭️ <strong>{fmt(result.skipped)}</strong> ilan atlandı (eksik fiyat/OEM).</div>
          <div>{result.errors > 0 ? "⚠️" : "•"} <strong>{fmt(result.errors)}</strong> hata.</div>
          <div className="text-xs text-muted-foreground pt-1">
            Sitemap: {result.sitemapResubmitted ? "Google'a yeniden gönderildi ✓" : `Gönderilemedi (${result.sitemapError ?? "—"})`}
          </div>
          <div className="text-xs text-muted-foreground">
            İşlem kayıt edildi (admin_audit_log).
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const cls = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-400" : "";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
