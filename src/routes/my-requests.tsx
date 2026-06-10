import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, Check, X as XIcon, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/my-requests")({
  head: () => ({ meta: [{ title: "Taleplerim — Taşıtsan" }, { name: "robots", content: "noindex" }] }),
  component: MyRequestsPage,
});

interface MyRequest {
  id: string;
  part_name: string | null;
  search_query: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  oem_code: string | null;
  engine_code: string | null;
  city: string | null;
  category: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

interface IncomingQuote {
  id: string;
  request_id: string;
  price: number;
  delivery_time: string;
  condition: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Açık", in_progress: "İşleniyor", resolved: "Kapalı",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  in_progress: "bg-gold/15 text-gold border-gold/40",
  resolved: "bg-muted text-muted-foreground border-border",
};
const COND_LABEL: Record<string, string> = { new: "Sıfır", used: "Çıkma", refurbished: "Revizyonlu" };

function MyRequestsPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [reqs, setReqs] = useState<MyRequest[]>([]);
  const [quotes, setQuotes] = useState<IncomingQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MyRequest | null>(null);

  useEffect(() => { if (!authLoading && !user) nav({ to: "/auth" }); }, [authLoading, user, nav]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: rData } = await supabase
      .from("part_requests")
      .select("id,part_name,search_query,brand,model,year,oem_code,engine_code,city,category,description,status,created_at")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });
    const myReqs = (rData ?? []) as MyRequest[];
    setReqs(myReqs);
    if (myReqs.length) {
      const ids = myReqs.map((r) => r.id);
      const { data: qData } = await supabase
        .from("request_quotes")
        .select("id,request_id,price,delivery_time,condition,note,status,created_at")
        .in("request_id", ids)
        .eq("status", "approved");
      setQuotes((qData ?? []) as IncomingQuote[]);
    } else {
      setQuotes([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const quotesByReq = useMemo(() => {
    const m = new Map<string, IncomingQuote[]>();
    quotes.forEach((q) => {
      const arr = m.get(q.request_id) ?? [];
      arr.push(q);
      m.set(q.request_id, arr);
    });
    return m;
  }, [quotes]);

  const closeRequest = async (id: string) => {
    if (!confirm("Talebi kapatmak istediğinize emin misiniz?")) return;
    const { error } = await supabase.from("part_requests").update({ status: "resolved" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Talep kapatıldı.");
    void load();
  };

  const deleteRequest = async (id: string) => {
    if (!confirm("Talebi silmek istediğinize emin misiniz?")) return;
    const { error } = await supabase.from("part_requests").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Talep silindi.");
    void load();
  };

  if (authLoading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/account" className="size-9 rounded-full bg-card grid place-items-center">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="font-display text-lg tracking-wide">Taleplerim</h1>
            <p className="text-[11px] text-muted-foreground">{reqs.length} talep · gelen onaylı teklifler</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
        ) : reqs.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3 bg-card border border-border rounded-2xl">
            <ClipboardList className="size-10 text-gold mx-auto" />
            <p className="font-display">Henüz talep oluşturmadın.</p>
            <p className="text-xs text-muted-foreground">Aradığın parça için talep oluştur, satıcılar teklif versin.</p>
          </div>
        ) : (
          reqs.map((r) => {
            const qs = quotesByReq.get(r.id) ?? [];
            const isClosed = r.status === "resolved";
            return (
              <article key={r.id} className="bg-card rounded-xl border border-border p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm leading-tight">
                      {r.part_name || r.search_query || "Parça talebi"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[r.brand, r.model, r.year, r.city].filter(Boolean).join(" • ") || "—"}
                    </p>
                    {(r.oem_code || r.engine_code) && (
                      <p className="text-[10px] font-mono text-muted-foreground/80 mt-0.5">
                        {r.oem_code && <>OEM: {r.oem_code}</>}
                        {r.oem_code && r.engine_code && " · "}
                        {r.engine_code && <>Motor: {r.engine_code}</>}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_COLOR[r.status] ?? STATUS_COLOR.new}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>

                {qs.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-gold font-semibold">Gelen Teklifler ({qs.length})</p>
                    {qs.map((q) => (
                      <div key={q.id} className="rounded-lg border border-border bg-background/50 p-2.5 text-[12px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-gold font-bold text-sm">₺{Number(q.price).toLocaleString("tr-TR")}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(q.created_at).toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {COND_LABEL[q.condition] ?? q.condition} · {q.delivery_time}
                        </p>
                        {q.note && <p className="text-[11px] text-foreground/90 leading-relaxed">{q.note}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    Henüz onaylı teklif yok. Satıcı teklifleri Taşıtsan onayından sonra burada görünecek.
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  {!isClosed && (
                    <>
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setEditing(r)}>
                        <Pencil className="size-3 mr-1.5" /> Düzenle
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => closeRequest(r.id)}>
                        <Check className="size-3 mr-1.5" /> Kapat
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive" onClick={() => deleteRequest(r.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </main>

      <BottomNav />

      <EditRequestDialog request={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
    </div>
  );
}

function EditRequestDialog({
  request, onClose, onSaved,
}: { request: MyRequest | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ part_name: "", brand: "", model: "", year: "", oem_code: "", engine_code: "", city: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (request) setForm({
      part_name: request.part_name ?? "",
      brand: request.brand ?? "",
      model: request.model ?? "",
      year: request.year?.toString() ?? "",
      oem_code: request.oem_code ?? "",
      engine_code: request.engine_code ?? "",
      city: request.city ?? "",
      description: request.description ?? "",
    });
  }, [request]);

  if (!request) return null;

  const save = async () => {
    if (!form.part_name.trim()) { toast.error("Parça adı zorunludur."); return; }
    setSaving(true);
    const { error } = await supabase.from("part_requests").update({
      part_name: form.part_name.trim(),
      search_query: form.part_name.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      year: form.year ? parseInt(form.year) : null,
      oem_code: form.oem_code.trim() || null,
      engine_code: form.engine_code.trim() || null,
      city: form.city.trim() || null,
      description: form.description.trim() || null,
    }).eq("id", request.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Talep güncellendi.");
    onSaved();
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Talebi Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <Input placeholder="Parça Adı *" value={form.part_name} maxLength={120}
            onChange={(e) => setForm({ ...form, part_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Marka" value={form.brand} maxLength={40}
              onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <Input placeholder="Model" value={form.model} maxLength={40}
              onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Yıl" inputMode="numeric" value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            <Input placeholder="Şehir" value={form.city} maxLength={60}
              onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="OEM" className="font-mono" value={form.oem_code} maxLength={60}
              onChange={(e) => setForm({ ...form, oem_code: e.target.value.toUpperCase() })} />
            <Input placeholder="Motor Kodu" className="font-mono" value={form.engine_code} maxLength={40}
              onChange={(e) => setForm({ ...form, engine_code: e.target.value.toUpperCase() })} />
          </div>
          <Textarea placeholder="Açıklama" rows={3} maxLength={600} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} className="resize-none" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">İptal</Button>
          <Button onClick={save} disabled={saving} className="flex-1 bg-gold-gradient text-gold-foreground font-semibold">
            {saving ? "..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
