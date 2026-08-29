// Admin → Bekleyen Talepler: OEM bazında toplanan talepler.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Row {
  oem_code: string;
  part_name: string | null;
  brand: string | null;
  model: string | null;
  request_count: number;
  total_quantity: number;
  first_request_at: string;
  last_request_at: string;
  notified_count: number;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("tr-TR") : "—");

export function PendingRequestsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_pending_part_requests" as never);
    if (error) console.warn("[pending-requests]", error);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg tracking-wide flex items-center gap-2">
          <Inbox className="size-4 text-gold" /> Bekleyen Talepler
        </h2>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>

      {rows === null ? (
        <div className="py-10 grid place-items-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Bekleyen talep yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-background/60 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">OEM No</th>
                <th className="px-3 py-2 font-medium">Ürün Adı</th>
                <th className="px-3 py-2 font-medium text-right">Talep</th>
                <th className="px-3 py-2 font-medium text-right">Adet</th>
                <th className="px-3 py-2 font-medium">İlk Talep</th>
                <th className="px-3 py-2 font-medium">Son Talep</th>
                <th className="px-3 py-2 font-medium">Bildirim</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.oem_code} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-gold whitespace-nowrap">{r.oem_code}</td>
                  <td className="px-3 py-2">
                    <div className="truncate max-w-[240px]">{r.part_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[r.brand, r.model].filter(Boolean).join(" ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{r.request_count}</td>
                  <td className="px-3 py-2 text-right">{r.total_quantity}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(r.first_request_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(r.last_request_at)}</td>
                  <td className="px-3 py-2">
                    {r.notified_count > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">
                        {r.notified_count}/{r.request_count} bildirildi
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                        Bekliyor
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
