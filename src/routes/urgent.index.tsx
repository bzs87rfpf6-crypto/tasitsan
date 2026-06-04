import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Siren, MapPin, Clock, Plus, Check, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/urgent/")({
  head: () => ({
    meta: [
      { title: "🚨 Acil Parça Talepleri — Taşıtsan" },
      { name: "description", content: "Acil parça talepleri ve tedarikçi teklifleri. Bende var deyin, müşteriye Taşıtsan iletir." },
    ],
  }),
  component: UrgentPage,
});

interface UrgentRequest {
  id: string;
  oem_code: string | null;
  part_name: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  city: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  has_my_quote: boolean;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function UrgentPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<UrgentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState<UrgentRequest | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_urgent_requests_for_supplier", { _limit: 100 });
    if (error) {
      console.error("[urgent] list error", error);
      toast.error("Acil talepler yüklenemedi");
    }
    setRows((data ?? []) as UrgentRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
    // Realtime: yeni acil talep gelirse listeyi tazele
    const ch = supabase
      .channel("urgent-requests")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "part_requests", filter: "is_urgent=eq.true" },
        () => { load(); toast("🚨 Yeni acil parça talebi geldi"); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader subtitle="Acil Talepler" />
        <div className="max-w-md mx-auto px-4 py-10 text-center space-y-3">
          <Siren className="size-12 text-destructive mx-auto" />
          <p className="font-display text-lg">Acil talepleri görmek için giriş yapın</p>
          <Link to="/auth" className="inline-block text-gold font-semibold">Giriş Yap →</Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <AppHeader subtitle="Acil Talepler" />

      <section className="bg-gradient-to-b from-destructive/15 via-background to-background border-b border-destructive/30">
        <div className="max-w-md mx-auto px-4 py-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-destructive/20 grid place-items-center animate-pulse">
              <Siren className="size-6 text-destructive" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="font-display text-xl tracking-wide text-destructive">🚨 Acil Parça Talepleri</h1>
              <p className="text-[11px] text-muted-foreground">Bende var deyin, Taşıtsan müşteriye iletsin.</p>
            </div>
          </div>
          <Button
            onClick={() => nav({ to: "/urgent/new" })}
            className="w-full h-12 bg-gradient-to-r from-destructive to-destructive/80 text-white font-semibold shadow-lg"
          >
            <Plus className="size-4 mr-1" /> Acil Parça Talebi Oluştur
          </Button>
        </div>
      </section>

      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-card animate-pulse border border-border" />
          ))
        ) : rows.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-2xl">
            <Siren className="size-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Şu an açık acil talep yok.</p>
          </div>
        ) : (
          rows.map((r) => (
            <article key={r.id} className="bg-card border border-destructive/40 rounded-xl p-4 space-y-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-destructive font-bold">
                    <Siren className="size-3" /> Acil
                    <span className="text-muted-foreground font-normal normal-case">· {timeAgo(r.created_at)}</span>
                  </div>
                  <h3 className="font-semibold text-base leading-tight mt-1">{r.part_name || "Parça"}</h3>
                </div>
                {r.has_my_quote && (
                  <span className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 font-semibold">
                    <Check className="size-3 inline -mt-0.5" /> Teklif verdiniz
                  </span>
                )}
              </div>

              {r.oem_code && (
                <p className="text-xs font-mono text-gold bg-gold/10 inline-block px-2 py-0.5 rounded">OEM: {r.oem_code}</p>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                {(r.brand || r.model || r.year) && (
                  <p>🚗 {[r.brand, r.model, r.year].filter(Boolean).join(" · ")}</p>
                )}
                {r.city && <p className="flex items-center gap-1"><MapPin className="size-3" />{r.city}</p>}
                {r.category && <p className="text-[10px] uppercase tracking-wider text-gold">{r.category}</p>}
              </div>

              {r.notes && (
                <p className="text-xs text-foreground/80 bg-background/50 rounded p-2 line-clamp-3">{r.notes}</p>
              )}

              <Button
                onClick={() => setQuoting(r)}
                disabled={r.has_my_quote}
                className="w-full bg-gold-gradient text-gold-foreground font-bold shadow-gold disabled:opacity-50"
              >
                {r.has_my_quote ? "Teklifiniz Alındı" : "✓ Bende Var"}
              </Button>
            </article>
          ))
        )}
      </div>

      <BottomNav />
      <QuoteDialog
        request={quoting}
        userId={user.id}
        onClose={() => setQuoting(null)}
        onSuccess={() => { setQuoting(null); load(); }}
      />
    </div>
  );
}

function QuoteDialog({
  request, userId, onClose, onSuccess,
}: {
  request: UrgentRequest | null;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setPrice(""); setStock("1"); setNote(""); }, [request?.id]);

  if (!request) return null;

  const submit = async () => {
    const p = parseFloat(price);
    const s = parseInt(stock);
    if (!p || p <= 0) { toast.error("Geçerli bir fiyat girin"); return; }
    if (!s || s <= 0) { toast.error("Geçerli stok adedi girin"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("request_quotes").insert({
      request_id: request.id,
      seller_id: userId,
      price: p,
      stock_quantity: s,
      note: note.trim() || null,
      delivery_time: null,
      condition: null,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      console.error("[urgent quote] insert", error);
      toast.error(error.message);
      return;
    }
    toast.success("Teklifiniz Taşıtsan'a iletildi. Onaylandığında müşteriye gönderilir.");
    onSuccess();
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Siren className="size-4 text-destructive" />
            Bende Var — Teklif Ver
          </DialogTitle>
          <DialogDescription>
            <span className="block text-foreground font-semibold">{request.part_name}</span>
            {request.oem_code && <span className="block font-mono text-xs text-gold">OEM: {request.oem_code}</span>}
            <span className="block text-[11px] mt-1">Teklifiniz Taşıtsan tarafından incelenip müşteriye iletilir. Müşteri iletişim bilgileri gizlidir.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gold font-semibold">Fiyat (₺) *</label>
            <Input
              type="number" min="0" step="1" inputMode="decimal"
              value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="Örn. 1500"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gold font-semibold">Stok Adedi *</label>
            <Input
              type="number" min="1" step="1" inputMode="numeric"
              value={stock} onChange={(e) => setStock(e.target.value)}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gold font-semibold">Not (opsiyonel)</label>
            <Textarea
              rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Durum, garanti, kargo süresi vb."
              className="mt-1 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            <XIcon className="size-4 mr-1" /> Vazgeç
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
            {submitting ? "Gönderiliyor..." : "Teklif Gönder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
