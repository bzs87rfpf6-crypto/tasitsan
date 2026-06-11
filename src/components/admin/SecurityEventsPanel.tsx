import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSecurityEvents } from "@/lib/security.functions";
import { ShieldAlert, RefreshCw, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Event = {
  id: string;
  event_type: string;
  severity: string;
  user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  route: string | null;
  details: any;
  created_at: string;
};

const SEVERITY_STYLE: Record<string, { bg: string; icon: any; label: string }> = {
  info: { bg: "bg-blue-500/10 text-blue-500", icon: Info, label: "Bilgi" },
  warn: { bg: "bg-amber-500/15 text-amber-500", icon: AlertTriangle, label: "Uyarı" },
  critical: { bg: "bg-destructive/15 text-destructive", icon: AlertCircle, label: "Kritik" },
};

const EVENT_LABELS: Record<string, string> = {
  login_failed: "Başarısız giriş",
  rate_limited: "Hız sınırı aşıldı",
  unauthorized_access: "Yetkisiz erişim",
  file_rejected: "Dosya reddedildi",
  admin_action: "Yönetici işlemi",
  suspicious_api: "Şüpheli API kullanımı",
};

export function SecurityEventsPanel() {
  const fetchEvents = useServerFn(listSecurityEvents);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "warn" | "critical">("all");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchEvents({
        data: {
          limit: 200,
          severity: filter === "all" ? undefined : filter,
        },
      });
      setEvents(data as Event[]);
    } catch (e: any) {
      setErr(e?.message ?? "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const counts = {
    total: events.length,
    warn: events.filter((e) => e.severity === "warn").length,
    critical: events.filter((e) => e.severity === "critical").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" /> Güvenlik Olayları
          </h2>
          <p className="text-xs text-muted-foreground">
            {counts.total} olay · {counts.warn} uyarı · {counts.critical} kritik
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(["all", "warn", "critical"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f
                ? "bg-gold-gradient text-gold-foreground border-transparent"
                : "border-border text-muted-foreground"
            }`}
          >
            {f === "all" ? "Tümü" : f === "warn" ? "Uyarılar" : "Kritik"}
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="space-y-2">
        {events.length === 0 && !loading && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Henüz güvenlik olayı kaydedilmedi.
          </p>
        )}
        {events.map((e) => {
          const sev = SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.info;
          const Icon = sev.icon;
          return (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg ${sev.bg} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">
                      {EVENT_LABELS[e.event_type] ?? e.event_type}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${sev.bg} font-semibold uppercase`}>
                      {sev.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {new Date(e.created_at).toLocaleString("tr-TR")}
                    {e.ip && ` · IP: ${e.ip}`}
                    {e.route && ` · ${e.route}`}
                  </p>
                  {e.details && Object.keys(e.details).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground mt-1 font-mono bg-muted/30 rounded px-2 py-1 overflow-x-auto">
                      {JSON.stringify(e.details, null, 0)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
