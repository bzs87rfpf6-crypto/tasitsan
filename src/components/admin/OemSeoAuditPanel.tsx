import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { runOemSeoAudit } from "@/lib/oem-seo.functions";
import { Loader2, RefreshCw, FileSearch } from "lucide-react";

interface AuditRow {
  total_approved: number;
  with_oem: number;
  missing_oem: number;
  missing_photo: number;
  thin_description: number;
  distinct_oems: number;
}

export function OemSeoAuditPanel() {
  const audit = useServerFn(runOemSeoAudit);
  const [data, setData] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await audit();
      setData(res as AuditRow);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const pct = (n: number) => (data && data.total_approved > 0
    ? `%${Math.round((n / data.total_approved) * 100)}`
    : "%0");

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSearch className="size-5 text-gold" />
          <div>
            <h3 className="font-semibold">OEM SEO Doğrulama Raporu</h3>
            <p className="text-xs text-muted-foreground">Onaylı + stokta ürünler üzerinde SEO eksiklerini gösterir.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span className="ml-1.5">Yenile</span>
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Metric label="Toplam Aktif Ürün" value={data.total_approved.toLocaleString("tr-TR")} />
          <Metric label="OEM'li Ürün" value={`${data.with_oem.toLocaleString("tr-TR")} (${pct(data.with_oem)})`} tone="good" />
          <Metric label="Benzersiz OEM Sayfası" value={data.distinct_oems.toLocaleString("tr-TR")} tone="good" />
          <Metric label="OEM Eksik" value={`${data.missing_oem.toLocaleString("tr-TR")} (${pct(data.missing_oem)})`} tone="warn" />
          <Metric label="Görseli Eksik" value={`${data.missing_photo.toLocaleString("tr-TR")} (${pct(data.missing_photo)})`} tone="warn" />
          <Metric label="Zayıf Açıklama (<20 kar.)" value={`${data.thin_description.toLocaleString("tr-TR")} (${pct(data.thin_description)})`} tone="warn" />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        OEM kodu olan tüm ürünler otomatik olarak: OEM-öncelikli SEO başlığı, meta description, Product schema, OEM bilgi kutusu,
        eşdeğer linkleme ve <code className="font-mono">/oem/{`{kod}`}</code> SEO sayfasına yönlendirme alır.
      </p>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const cls = tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
