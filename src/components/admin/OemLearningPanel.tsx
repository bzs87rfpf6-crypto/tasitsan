// Admin → Öğrenilmeyi Bekleyen Aramalar.
// Başarısız AI/kullanıcı aramalarını listeler; tek tıkla oem_reference'a ekleme sunar.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Brain, Plus, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";

type FailedRow = {
  id: string;
  oem: string;
  oem_normalized: string | null;
  brand: string | null;
  title: string | null;
  reason: string;
  attempt_count: number;
  last_attempt_at: string;
};

export function OemLearningPanel() {
  const [rows, setRows] = useState<FailedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { brand: string; model: string; part_name: string; category: string; notes: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("oem_failed_searches")
      .select("id, oem, oem_normalized, brand, title, reason, attempt_count, last_attempt_at")
      .order("last_attempt_at", { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) { toast.error("Yüklenemedi: " + error.message); return; }
    setRows((data ?? []) as FailedRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  function upd(id: string, patch: Partial<{ brand: string; model: string; part_name: string; category: string; notes: string }>) {
    setForm((f) => {
      const prev = f[id] ?? { brand: "", model: "", part_name: "", category: "", notes: "" };
      return { ...f, [id]: { ...prev, ...patch } };
    });
  }

  async function learn(row: FailedRow) {
    const f = form[row.id] ?? { brand: row.brand ?? "", model: "", part_name: row.title ?? "", category: "", notes: "" };
    if (!row.oem || row.oem.length < 3) { toast.error("Geçersiz OEM"); return; }

    setSavingId(row.id);
    const { error } = await supabase.from("oem_reference").insert({
      oem: row.oem,
      oem_raw: row.oem,
      brand: f.brand || row.brand || null,
      model: f.model || null,
      part_name: f.part_name || row.title || null,
      category: f.category || null,
      notes: f.notes || null,
      source: "ai_learned",
      verified: true,
      confidence: 0.85,
    });
    setSavingId(null);

    if (error) { toast.error("Kaydedilemedi: " + error.message); return; }

    // Delete the failed search so it stops appearing
    await supabase.from("oem_failed_searches").delete().eq("id", row.id);
    toast.success("OEM Referans Bankası'na eklendi ✓");
    setRows((r) => r.filter((x) => x.id !== row.id));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="size-5 text-primary" />
        <h3 className="font-semibold text-lg">Öğrenilmeyi Bekleyen Aramalar</h3>
        <span className="text-xs text-muted-foreground ml-2">
          Kullanıcıların sorup bulamadığı OEM/parçalar. Onaylayarak AI'ya öğret.
        </span>
        <Button size="sm" variant="ghost" onClick={load} className="ml-auto" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>

      {rows.length === 0 && !loading && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
          <CheckCircle2 className="size-6 mx-auto mb-1 text-emerald-500" />
          Şu an bekleyen kayıt yok. Sistem sağlıklı.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const f = form[r.id] ?? { brand: r.brand ?? "", model: "", part_name: r.title ?? "", category: "", notes: "" };
          return (
            <div key={r.id} className="rounded-lg border border-border p-3 bg-background">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="font-mono text-sm px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">{r.oem}</span>
                <span className="text-xs text-muted-foreground">{r.reason}</span>
                <span className="text-xs text-muted-foreground">· {r.attempt_count} deneme</span>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(r.last_attempt_at).toLocaleString("tr-TR")}</span>
              </div>
              {r.title && <div className="text-xs text-muted-foreground mb-2 truncate">Sorgu: {r.title}</div>}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Input placeholder="Marka" value={f.brand} onChange={(e) => upd(r.id, { brand: e.target.value })} className="h-8 text-xs" />
                <Input placeholder="Model" value={f.model} onChange={(e) => upd(r.id, { model: e.target.value })} className="h-8 text-xs" />
                <Input placeholder="Parça adı" value={f.part_name} onChange={(e) => upd(r.id, { part_name: e.target.value })} className="h-8 text-xs" />
                <Input placeholder="Kategori" value={f.category} onChange={(e) => upd(r.id, { category: e.target.value })} className="h-8 text-xs" />
                <Input placeholder="Not" value={f.notes} onChange={(e) => upd(r.id, { notes: e.target.value })} className="h-8 text-xs" />
              </div>

              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={() => learn(r)} disabled={savingId === r.id}>
                  {savingId === r.id ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Plus className="size-3.5 mr-1" />}
                  OEM Bankası'na Ekle
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
