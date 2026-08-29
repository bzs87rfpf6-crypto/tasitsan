import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, MousePointerClick, Send, UserCheck, AlertTriangle, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/StatCard";
import { getSignupFunnelStats, type SignupFunnelStats } from "@/lib/signup-funnel.functions";

const RANGES = [1, 7, 30] as const;
const RANGE_LABEL: Record<number, string> = { 1: "24 Saat", 7: "7 Gün", 30: "30 Gün" };

export function SignupFunnelPanel() {
  const fetcher = useServerFn(getSignupFunnelStats);
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<SignupFunnelStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetcher({ data: { days } });
      if (res) setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Veri alınamadı");
    } finally {
      setBusy(false);
    }
  }, [fetcher, days]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gold">Kayıt Dönüşüm Hunisi</div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={days === r ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => setDays(r)}
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {err && <div className="text-[11px] text-destructive">{err}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard icon={<Eye className="size-3" />} label="Kayıt Ekranı Görüntüleme" value={data.view} />
            <StatCard icon={<MousePointerClick className="size-3" />} label="Kayıt Başlatma" value={data.start} />
            <StatCard icon={<Send className="size-3" />} label="Form Gönderimi" value={data.submit} />
            <StatCard icon={<UserCheck className="size-3" />} label="Başarılı Kayıt" value={data.success} />
            <StatCard icon={<AlertTriangle className="size-3" />} label="Hata" value={data.error} />
            <StatCard icon={<Users className="size-3" />} label="Gerçek Yeni Üye (DB)" value={data.new_users} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-border px-3 py-2">
              Görüntüleme → Kayıt dönüşümü:{" "}
              <span className="text-gold font-semibold">%{data.conversion_rate}</span>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              Form → Başarı oranı:{" "}
              <span className="text-gold font-semibold">%{data.submit_success_rate}</span>
            </div>
          </div>

          {data.top_errors?.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">En sık hata kodları</div>
              <div className="flex flex-wrap gap-1">
                {data.top_errors.map((e) => (
                  <span key={e.error_code} className="rounded-md border border-border px-2 py-1 text-[11px] font-mono">
                    {e.error_code} · {e.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
