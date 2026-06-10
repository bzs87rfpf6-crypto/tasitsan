import { translateError } from "@/lib/error-messages";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Siren, Phone, Mail, MessageCircle, Check, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface UrgentRow {
  id: string;
  oem_code: string | null;
  part_name: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  city: string | null;
  category: string | null;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  created_at: string;
}

interface QuoteRow {
  id: string;
  request_id: string;
  seller_id: string;
  price: number;
  stock_quantity: number | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  seller_name?: string | null;
  seller_phone?: string | null;
}

export function UrgentRequestsPanel() {
  const [rows, setRows] = useState<UrgentRow[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [adminNoteFor, setAdminNoteFor] = useState<UrgentRow | null>(null);
  const [noteVal, setNoteVal] = useState("");

  const load = async () => {
    setLoading(true);
    const { adminGetUrgentRequests, adminGetSellerContacts } = await import("@/lib/admin-data.functions");
    let list: UrgentRow[] = [];
    try {
      list = (await adminGetUrgentRequests()) as UrgentRow[];
    } catch (e: any) {
      toast.error(translateError(e, "Acil talepler yüklenemedi"));
      setLoading(false);
      return;
    }
    setRows(list);

    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data: qs } = await supabase
        .from("request_quotes")
        .select("id,request_id,seller_id,price,stock_quantity,note,status,created_at")
        .in("request_id", ids)
        .order("created_at", { ascending: false });
      const sellerIds = Array.from(new Set((qs ?? []).map((q: any) => q.seller_id)));
      const profMap = new Map<string, { name: string | null; phone: string | null }>();
      if (sellerIds.length) {
        try {
          const profs = await adminGetSellerContacts({ data: { ids: sellerIds } });
          for (const p of profs) profMap.set(p.id, { name: p.display_name, phone: p.whatsapp });
        } catch { /* ignore */ }
      }
      const byReq: Record<string, QuoteRow[]> = {};
      for (const q of (qs ?? []) as any[]) {
        const info = profMap.get(q.seller_id);
        const row: QuoteRow = { ...q, seller_name: info?.name ?? null, seller_phone: info?.phone ?? null };
        (byReq[q.request_id] ??= []).push(row);
      }
      setQuotes(byReq);
    } else {
      setQuotes({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateQuoteStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("request_quotes")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(status === "approved" ? "Teklif onaylandı — müşteri görebilir." : "Teklif reddedildi.");
    load();
  };

  const saveAdminNote = async () => {
    if (!adminNoteFor) return;
    const { error } = await supabase
      .from("part_requests")
      .update({ admin_notes: noteVal.trim() || null })
      .eq("id", adminNoteFor.id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Not kaydedildi");
    setAdminNoteFor(null);
    load();
  };

  const setStatus = async (id: string, status: "in_progress" | "resolved") => {
    const { error } = await supabase.from("part_requests").update({ status }).eq("id", id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Durum güncellendi");
    load();
  };

  if (loading) return <p className="text-center text-sm text-muted-foreground py-8">Yükleniyor...</p>;
  if (rows.length === 0) return (
    <div className="text-center py-12 bg-card border border-border rounded-2xl mx-4">
      <Siren className="size-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">Henüz acil talep yok.</p>
    </div>
  );

  return (
    <div className="space-y-3 px-2">
      {rows.map((r) => {
        const qs = quotes[r.id] ?? [];
        return (
          <article key={r.id} className="bg-card border border-destructive/40 rounded-xl p-3 sm:p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-destructive font-bold">
                  <Siren className="size-3" /> Acil
                  <span className="text-muted-foreground font-normal normal-case">{new Date(r.created_at).toLocaleString("tr-TR")}</span>
                </div>
                <h3 className="font-semibold text-sm mt-0.5">{r.part_name}</h3>
                {r.oem_code && <p className="text-xs font-mono text-gold">OEM: {r.oem_code}</p>}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {[r.brand, r.model, r.year, r.city, r.category].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${
                r.status === "resolved" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                : r.status === "in_progress" ? "bg-blue-500/15 text-blue-400 border-blue-500/40"
                : "bg-gold/15 text-gold border-gold/40"
              }`}>{r.status}</span>
            </div>

            {r.notes && <p className="text-xs text-foreground/80 bg-background/50 rounded p-2">{r.notes}</p>}

            {/* Müşteri iletişim — sadece admin görür */}
            <div className="bg-gold/5 border border-gold/30 rounded-lg p-2.5 text-xs space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-gold font-bold">📞 Müşteri İletişim (sadece admin)</p>
              <p className="font-semibold">{r.full_name}</p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <a href={`tel:${r.phone}`} className="text-gold hover:underline flex items-center gap-1"><Phone className="size-3" />{r.phone}</a>
                <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-1"><MessageCircle className="size-3" />WhatsApp</a>
                {r.email && <a href={`mailto:${r.email}`} className="text-blue-400 hover:underline flex items-center gap-1"><Mail className="size-3" />{r.email}</a>}
              </div>
            </div>

            {/* Teklifler */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tedarikçi Teklifleri ({qs.length})</p>
              {qs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">Henüz teklif yok.</p>
              ) : qs.map((q) => (
                <div key={q.id} className="bg-background/60 border border-border rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{q.seller_name || "Tedarikçi"}</p>
                      <p className="text-[10px] text-muted-foreground">{q.seller_phone ?? "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-gold font-bold">₺{Number(q.price).toLocaleString("tr-TR")}</p>
                      <p className="text-[10px] text-muted-foreground">Stok: {q.stock_quantity ?? "—"}</p>
                    </div>
                  </div>
                  {q.note && <p className="text-[11px] text-foreground/80">{q.note}</p>}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      q.status === "approved" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                      : q.status === "rejected" ? "bg-destructive/15 text-destructive border-destructive/40"
                      : "bg-gold/15 text-gold border-gold/40"
                    }`}>{q.status}</span>
                    {q.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => updateQuoteStatus(q.id, "rejected")}>
                          <XIcon className="size-3" />
                        </Button>
                        <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateQuoteStatus(q.id, "approved")}>
                          <Check className="size-3 mr-0.5" /> Müşteriye İlet
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {r.admin_notes && (
              <p className="text-[11px] text-muted-foreground bg-background/40 rounded p-2">
                <span className="font-semibold text-gold">Admin notu:</span> {r.admin_notes}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="text-[11px]"
                onClick={() => { setAdminNoteFor(r); setNoteVal(r.admin_notes ?? ""); }}>
                Not Ekle
              </Button>
              {r.status !== "in_progress" && r.status !== "resolved" && (
                <Button size="sm" variant="outline" className="text-[11px]"
                  onClick={() => setStatus(r.id, "in_progress")}>İşleme Al</Button>
              )}
              {r.status !== "resolved" && (
                <Button size="sm" className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setStatus(r.id, "resolved")}>Tamamlandı</Button>
              )}
            </div>
          </article>
        );
      })}

      {adminNoteFor && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => setAdminNoteFor(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-base">Admin Notu — {adminNoteFor.part_name}</p>
            <Textarea rows={4} value={noteVal} onChange={(e) => setNoteVal(e.target.value)}
              placeholder="Müşteriye iletilen mesaj, geri bildirim..." className="resize-none" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdminNoteFor(null)}>Vazgeç</Button>
              <Button onClick={saveAdminNote} className="bg-gold-gradient text-gold-foreground">Kaydet</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
