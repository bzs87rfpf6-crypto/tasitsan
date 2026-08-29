import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSeoHealth, type SeoHealth } from "@/lib/gsc.functions";
import { translateError } from "@/lib/error-messages";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("tr-TR"); } catch { return iso; }
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
        (ok
          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          : "bg-destructive/15 text-destructive border border-destructive/30")
      }
    >
      <span className={"h-1.5 w-1.5 rounded-full " + (ok ? "bg-emerald-400" : "bg-destructive")} />
      {label}
    </span>
  );
}

export function SeoSitemapPanel() {
  const runHealth = useServerFn(getSeoHealth);
  const [health, setHealth] = useState<SeoHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(autoSubmit: boolean) {
    if (autoSubmit) setBusy(true); else setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const h = await runHealth({ data: { autoSubmit } });
      setHealth(h);
      if (autoSubmit && h.submission.submitOk) {
        setMsg(
          h.submission.kind === "resubmit"
            ? "Sitemap Google'a yeniden gönderildi. Taranması birkaç saat sürebilir."
            : "Sitemap Google'a ilk kez gönderildi.",
        );
      }
    } catch (e) {
      setErr(translateError(e));
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }

  // Auto-run health + auto-submit on mount
  useEffect(() => { load(true); /* eslint-disable-next-line */ }, []);

  const submission = health?.submission;
  const s = submission?.status ?? null;
  const indexRatio = s && s.submitted > 0 ? Math.round((s.indexed / s.submitted) * 100) : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-display text-lg">SEO · Sitemap & Search Console</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Sitemap otomatik gönderilir. Sağlık raporu, HTTP durumları ve Google API yanıtlarını burada görürsünüz.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(false)}
            disabled={loading || busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Yükleniyor…" : "Sağlık Raporunu Yenile"}
          </button>
          <button
            onClick={() => load(true)}
            disabled={busy || loading}
            className="rounded-md bg-gold-gradient px-3 py-2 text-sm font-semibold text-gold-foreground shadow-gold disabled:opacity-50"
          >
            {busy
              ? "Gönderiliyor…"
              : health?.submission.status?.lastSubmitted
                ? "Sitemap'i Yeniden Gönder"
                : "Sitemap'i Şimdi Gönder"}
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {msg}
        </div>
      )}

      {health && (
        <div className="space-y-5">
          {/* 1. Property verification */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Search Console Mülkü</div>
                <div className="mt-1 font-semibold break-all">{health.site.siteUrl}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  İzin: {health.site.permissionLevel ?? "yok"} · HTTP {health.site.listStatus}
                </div>
              </div>
              <StatusPill ok={health.site.verified} label={health.site.verified ? "Doğrulanmış" : "DOĞRULANMAMIŞ"} />
            </div>
            {!health.site.verified && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-2">
                <p className="font-semibold">Otomatik gönderim yapılamıyor. Aşağıdaki adımları tamamlayın:</p>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>
                    <a
                      href="https://search.google.com/search-console"
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-amber-100"
                    >
                      Search Console
                    </a>{" "}
                    → Ayarlar → Kullanıcılar ve izinler.
                  </li>
                  <li>
                    Google Search Console bağlayıcısında oturum açan hesabı <b>Mülk sahibi</b> olarak ekleyin
                    (veya URL öneki mülkünü aynı hesap altında doğrulayın).
                  </li>
                  <li>Bu paneldeki "Sağlık Raporunu Yenile" butonuna basın.</li>
                </ol>
                {health.site.listBody && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[11px] leading-snug">
                    {health.site.listBody}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* 2. Reachability of sitemap.xml / robots.txt / children */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Erişilebilirlik Testi</div>
              <StatusPill
                ok={health.sitemap.index.ok && health.sitemap.robots.ok && health.sitemap.failedChildren === 0}
                label={
                  health.sitemap.index.ok && health.sitemap.robots.ok && health.sitemap.failedChildren === 0
                    ? "Tüm dosyalar erişilebilir"
                    : "Bazı dosyalar erişilemiyor"
                }
              />
            </div>
            <div className="grid gap-2 text-sm">
              <ProbeRow label="sitemap.xml" p={health.sitemap.index} />
              <ProbeRow label="robots.txt" p={health.sitemap.robots} />
            </div>
            {health.sitemap.children.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Alt sitemap dosyaları ({health.sitemap.children.length}) — {health.sitemap.failedChildren} hatalı
                </summary>
                <div className="mt-2 space-y-1 max-h-64 overflow-auto">
                  {health.sitemap.children.map((c) => (
                    <ProbeRow key={c.url} label={c.url.replace(/^https?:\/\/[^/]+/, "")} p={c} />
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* 3. Submission */}
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Gönderim Sonucu</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {submission?.kind === "resubmit"
                    ? "Yeniden gönderim (Resubmit) çağrıldı."
                    : submission?.kind === "submit"
                      ? "İlk gönderim (Submit) çağrıldı."
                      : "Gönderim atlandı."}
                  {submission?.submitStatus != null && ` · PUT HTTP ${submission.submitStatus}`}
                  {submission?.statusHttp != null && ` · GET HTTP ${submission.statusHttp}`}
                </div>
              </div>
              <StatusPill
                ok={!!submission?.submitOk || (!submission?.attempted && !!s?.lastSubmitted)}
                label={submission?.submitOk ? "Başarılı" : submission?.attempted ? "Başarısız" : "Bilgi"}
              />
            </div>

            {submission?.error && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {submission.error}
              </div>
            )}
            {submission?.submitBody && (
              <pre className="mb-3 max-h-40 overflow-auto rounded bg-black/30 p-2 text-[11px] leading-snug">
                {submission.submitBody}
              </pre>
            )}
            {submission?.statusBody && !submission?.submitBody && (
              <pre className="mb-3 max-h-40 overflow-auto rounded bg-black/30 p-2 text-[11px] leading-snug">
                {submission.statusBody}
              </pre>
            )}

            {s && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label="Gönderilen URL" value={s.submitted.toLocaleString("tr-TR")} />
                <Metric
                  label="İndekslenen URL"
                  value={s.indexed.toLocaleString("tr-TR")}
                  sub={s.submitted > 0 ? `%${indexRatio}` : undefined}
                  tone={s.submitted > 0 && indexRatio < 50 ? "warn" : "ok"}
                />
                <Metric label="Uyarı" value={String(s.warnings)} tone={s.warnings > 0 ? "warn" : "ok"} />
                <Metric label="Hata" value={String(s.errors)} tone={s.errors > 0 ? "err" : "ok"} />
                <Metric label="Son gönderim" value={fmtDate(s.lastSubmitted)} />
                <Metric label="Son indirme" value={fmtDate(s.lastDownloaded)} />
                <Metric label="Durum" value={s.isPending ? "İşleniyor" : "Tamamlandı"} />
                <Metric
                  label="Sitemap"
                  value={
                    <a href={s.path} target="_blank" rel="noreferrer" className="text-gold underline break-all">
                      {s.path.replace(/^https?:\/\//, "")}
                    </a>
                  }
                />
              </div>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground text-right">
            Rapor: {fmtDate(health.generatedAt)}
          </div>
        </div>
      )}
    </section>
  );
}

function ProbeRow({
  label,
  p,
}: {
  label: string;
  p: { url: string; status: number; ok: boolean; contentType: string | null; bytes: number; error?: string };
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {p.error ? p.error : `${p.contentType ?? "?"} · ${p.bytes.toLocaleString("tr-TR")} B`}
        </div>
      </div>
      <span
        className={
          "shrink-0 rounded px-2 py-0.5 text-[10px] font-mono font-semibold " +
          (p.ok
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-destructive/15 text-destructive")
        }
      >
        {p.status || "ERR"}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "err";
}) {
  const toneCls =
    tone === "warn" ? "text-amber-400" : tone === "err" ? "text-destructive" : tone === "ok" ? "text-emerald-300" : "";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
