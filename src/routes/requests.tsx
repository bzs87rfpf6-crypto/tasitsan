import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageSearch, Send, Check, Clock, X as XIcon, ArrowLeft, Megaphone, Timer, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SafePartImage } from "@/components/SafePartImage";

export const Route = createFileRoute("/requests")({
  head: () => ({ meta: [{ title: "Parça Talep Merkezi — Taşıtsan" }] }),
  component: RequestsPage,
});

const CATEGORIES = [
  "Tümü", "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

type Urgency = "all" | "normal" | "urgent" | "very_urgent";
type DateRange = "all" | "24h" | "7d" | "30d";

const URGENCY_META: Record<Exclude<Urgency, "all">, { label: string; emoji: string; cls: string }> = {
  normal:      { label: "Normal",   emoji: "🟢", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  urgent:      { label: "Acil",     emoji: "🟠", cls: "bg-orange-500/15 text-orange-400 border-orange-500/50" },
  very_urgent: { label: "Çok Acil", emoji: "🔴", cls: "bg-destructive/15 text-destructive border-destructive/60 animate-pulse" },
};

const URGENCY_FILTERS: Array<{ value: Urgency; label: string }> = [
  { value: "all", label: "Tüm Aciliyetler" },
  { value: "normal", label: "🟢 Normal" },
  { value: "urgent", label: "🟠 Acil" },
  { value: "very_urgent", label: "🔴 Çok Acil" },
];

const DATE_FILTERS: Array<{ value: DateRange; label: string }> = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "24h", label: "Son 24 saat" },
  { value: "7d", label: "Son 7 gün" },
  { value: "30d", label: "Son 30 gün" },
];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new:         { label: "Açık",          cls: "bg-card text-foreground border-border" },
  in_progress: { label: "Teklif Geldi",  cls: "bg-gold/15 text-gold border-gold/40" },
  resolved:    { label: "Karşılandı",    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  closed:      { label: "İptal Edildi",  cls: "bg-muted text-muted-foreground border-border" },
};

interface OpenRequest {
  id: string;
  part_name: string | null;
  search_query: string | null;
  oem_code: string | null;
  engine_code: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  city: string | null;
  description: string | null;
  message: string;
  photos: string[];
  status: string;
  created_at: string;
  urgency?: Urgency | null;
  is_urgent?: boolean | null;
}

interface MyQuote {
  id: string;
  request_id: string;
  price: number;
  delivery_time: string;
  condition: string;
  status: "pending" | "approved" | "rejected";
}

interface CenterStats {
  active: number;
  fulfilled: number;
  avg_first_quote_minutes: number;
  avg_fulfillment_hours: number;
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Sıfır", used: "Çıkma", refurbished: "Revizyonlu",
};
const QUOTE_STATUS_LABEL: Record<string, string> = {
  pending: "İncelemede", approved: "Onaylandı", rejected: "Reddedildi",
};
const QUOTE_STATUS_COLOR: Record<string, string> = {
  pending: "bg-gold/15 text-gold border-gold/40",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  rejected: "bg-destructive/15 text-destructive border-destructive/60",
};

function effectiveUrgency(r: OpenRequest): Exclude<Urgency, "all"> {
  if (r.urgency === "very_urgent") return "very_urgent";
  if (r.urgency === "urgent") return "urgent";
  if (r.urgency === "normal") return "normal";
  // Backward compat fallback
  return r.is_urgent ? "urgent" : "normal";
}

function formatMinutes(min: number): string {
  if (!min || min <= 0) return "—";
  if (min < 60) return `${Math.round(min)} dk`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)} sa`;
  return `${(h / 24).toFixed(1)} gün`;
}

function formatHours(h: number): string {
  if (!h || h <= 0) return "—";
  if (h < 24) return `${h.toFixed(1)} sa`;
  return `${(h / 24).toFixed(1)} gün`;
}

function RequestsPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [cat, setCat] = useState("Tümü");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency>("all");
  const [dateFilter, setDateFilter] = useState<DateRange>("all");
  const [requests, setRequests] = useState<OpenRequest[]>([]);
  const [myQuotes, setMyQuotes] = useState<MyQuote[]>([]);
  const [stats, setStats] = useState<CenterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState<OpenRequest | null>(null);

  useEffect(() => { if (!authLoading && !user) nav({ to: "/auth" }); }, [authLoading, user, nav]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [reqRes, quoteRes, statsRes] = await Promise.all([
      supabase.from("open_part_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("request_quotes").select("id,request_id,price,delivery_time,condition,status").eq("seller_id", user.id),
      (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>)("request_center_stats"),
    ]);
    if (reqRes.error) toast.error(reqRes.error.message);
    setRequests((reqRes.data ?? []) as OpenRequest[]);
    setMyQuotes((quoteRes.data ?? []) as MyQuote[]);
    if (!statsRes.error && statsRes.data) {
      setStats(statsRes.data as CenterStats);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) void load(); }, [user]);

  const myQuoteByRequest = useMemo(() => {
    const m = new Map<string, MyQuote>();
    myQuotes.forEach((q) => m.set(q.request_id, q));
    return m;
  }, [myQuotes]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const c = cityFilter.trim().toLowerCase();
    const now = Date.now();
    const cutoffMs = dateFilter === "24h" ? 24 * 3600 * 1000
                  : dateFilter === "7d" ? 7 * 24 * 3600 * 1000
                  : dateFilter === "30d" ? 30 * 24 * 3600 * 1000
                  : 0;
    return requests.filter((r) => {
      if (cat !== "Tümü" && r.category !== cat) return false;
      if (c && !(r.city || "").toLowerCase().includes(c)) return false;
      if (urgencyFilter !== "all" && effectiveUrgency(r) !== urgencyFilter) return false;
      if (cutoffMs && now - new Date(r.created_at).getTime() > cutoffMs) return false;
      if (s) {
        const hay = [r.part_name, r.brand, r.model, r.oem_code, r.engine_code, r.search_query]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [cat, requests, search, cityFilter, urgencyFilter, dateFilter]);

  if (authLoading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="size-9 rounded-full bg-card grid place-items-center"><ArrowLeft className="size-4" /></Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg tracking-wide flex items-center gap-1.5">
              <Megaphone className="size-4 text-gold" /> Parça Talep Merkezi
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Müşterilerin aradığı parçalara teklif verin · {filtered.length} talep
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 grid grid-cols-2 gap-2">
          <Input placeholder="Marka, model, OEM..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="h-9 text-xs" />
          <Input placeholder="Şehir" value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)} className="h-9 text-xs" />
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {URGENCY_FILTERS.map((u) => (
            <button key={u.value} onClick={() => setUrgencyFilter(u.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-all ${
                urgencyFilter === u.value
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}>{u.label}</button>
          ))}
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {DATE_FILTERS.map((d) => (
            <button key={d.value} onClick={() => setDateFilter(d.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border transition-all ${
                dateFilter === d.value
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}>{d.label}</button>
          ))}
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2.5 flex gap-1.5 overflow-x-auto scrollbar-none">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-all ${
                cat === c
                  ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                  : "border-border text-muted-foreground hover:text-gold hover:border-gold/50"
              }`}>{c}</button>
          ))}
        </div>
      </header>

      {/* Stats */}
      <section className="max-w-2xl mx-auto px-4 pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={<Megaphone className="size-4" />} label="Aktif Talep" value={stats?.active ?? 0} />
          <StatCard icon={<CheckCircle2 className="size-4" />} label="Karşılanan" value={stats?.fulfilled ?? 0} />
          <StatCard icon={<Timer className="size-4" />} label="Ort. İlk Teklif" value={formatMinutes(stats?.avg_first_quote_minutes ?? 0)} />
          <StatCard icon={<Clock className="size-4" />} label="Ort. Karşılanma" value={formatHours(stats?.avg_fulfillment_hours ?? 0)} />
        </div>
      </section>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3 bg-card border border-border rounded-2xl">
            <PackageSearch className="size-10 text-gold mx-auto" />
            <p className="font-display">Bu filtrelerle eşleşen talep yok.</p>
            <p className="text-xs text-muted-foreground">Filtreyi temizleyin veya yeni talepleri bekleyin.</p>
          </div>
        ) : (
          filtered.map((r) => {
            const mine = myQuoteByRequest.get(r.id);
            const u = effectiveUrgency(r);
            const um = URGENCY_META[u];
            const sm = STATUS_LABEL[r.status] ?? STATUS_LABEL.new;
            return (
              <article key={r.id} className="bg-card rounded-xl border border-border p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold ${um.cls}`}>
                    {um.emoji} {um.label}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${sm.cls}`}>
                    {sm.label}
                  </span>
                </div>
                <div className="flex gap-3">
                  {r.photos?.[0] && (
                    <div className="size-20 rounded-lg overflow-hidden bg-secondary shrink-0">
                      <SafePartImage images={r.photos} alt="" width={320} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to="/requests/$id" params={{ id: r.id }} className="font-semibold text-sm leading-tight line-clamp-2 hover:text-gold transition-colors">
                      {r.part_name || r.search_query || "Parça talebi"}
                    </Link>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                      {[r.brand, r.model, r.year, r.category].filter(Boolean).join(" • ") || "—"}
                    </p>
                    {(r.oem_code || r.engine_code) && (
                      <p className="text-[10px] font-mono text-muted-foreground/80 mt-0.5 line-clamp-1">
                        {r.oem_code && <>OEM: {r.oem_code}</>}
                        {r.oem_code && r.engine_code && " · "}
                        {r.engine_code && <>Motor: {r.engine_code}</>}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {r.city ? `${r.city} · ` : ""}{new Date(r.created_at).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                </div>
                {r.description && (
                  <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3 bg-background/40 rounded-lg p-2.5">
                    {r.description}
                  </p>
                )}
                {mine ? (
                  <div className="rounded-lg border border-border bg-background/50 p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-[12px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${QUOTE_STATUS_COLOR[mine.status]}`}>
                          {QUOTE_STATUS_LABEL[mine.status]}
                        </span>
                        <span className="text-gold font-bold">₺{Number(mine.price).toLocaleString("tr-TR")}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {CONDITION_LABEL[mine.condition]} · {mine.delivery_time}
                      </p>
                    </div>
                    {mine.status === "pending" && <Clock className="size-4 text-gold" />}
                    {mine.status === "approved" && <Check className="size-4 text-emerald-400" />}
                    {mine.status === "rejected" && <XIcon className="size-4 text-destructive" />}
                  </div>
                ) : (
                  <Button onClick={() => setQuoting(r)} size="sm"
                    className="w-full h-10 bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                    <Send className="size-3.5 mr-1.5" /> Teklif Ver
                  </Button>
                )}
              </article>
            );
          })
        )}
      </main>

      <BottomNav />

      <QuoteDialog
        request={quoting}
        userId={user.id}
        onClose={() => setQuoting(null)}
        onSubmitted={() => { setQuoting(null); void load(); }}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-gold text-[10px] uppercase tracking-wider font-semibold">
        {icon}<span className="truncate">{label}</span>
      </div>
      <p className="font-display text-xl mt-0.5 tracking-wide">{value}</p>
    </div>
  );
}

function QuoteDialog({
  request, userId, onClose, onSubmitted,
}: {
  request: OpenRequest | null;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState({ price: "", delivery_time: "", condition: "used", note: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (request) setForm({ price: "", delivery_time: "", condition: "used", note: "" });
  }, [request]);

  if (!request) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.price || parseFloat(form.price) <= 0) { toast.error("Geçerli bir fiyat girin."); return; }
    if (!form.delivery_time.trim()) { toast.error("Teslim süresi girin."); return; }
    setSubmitting(true);
    const { error } = await supabase.from("request_quotes").insert({
      request_id: request.id,
      seller_id: userId,
      price: parseFloat(form.price),
      delivery_time: form.delivery_time.trim(),
      condition: form.condition,
      note: form.note.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Teklifiniz iletildi. Admin onayı sonrası müşteriye sunulacak.");
    onSubmitted();
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Teklif Ver</DialogTitle>
          <DialogDescription>
            Diğer satıcılar teklifinizi göremez. Onaylanan teklifler Taşıtsan üzerinden müşteriye iletilir.
          </DialogDescription>
        </DialogHeader>

        <div className="text-[11px] bg-muted/40 rounded-lg p-2.5 space-y-0.5">
          <p className="font-semibold text-foreground">{request.part_name || request.search_query}</p>
          <p className="text-muted-foreground">{[request.brand, request.model, request.year].filter(Boolean).join(" • ")}</p>
          {request.oem_code && <p className="font-mono text-muted-foreground">OEM: {request.oem_code}</p>}
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          <Input placeholder="Fiyat ₺ *" inputMode="decimal" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })} />
          <Input placeholder="Teslim Süresi (ör. 2 iş günü) *" value={form.delivery_time}
            onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} maxLength={60} />
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-gold font-semibold">Ürün Durumu</label>
            <div className="grid grid-cols-3 gap-2">
              {(["new", "used", "refurbished"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, condition: c })}
                  className={`h-10 rounded-lg text-xs font-semibold border transition-all ${
                    form.condition === c
                      ? "bg-gold-gradient text-gold-foreground border-transparent shadow-gold"
                      : "border-border text-muted-foreground"
                  }`}>{CONDITION_LABEL[c]}</button>
              ))}
            </div>
          </div>
          <Textarea placeholder="Not (opsiyonel)" rows={3} maxLength={500} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} className="resize-none" />
          <DialogFooter>
            <Button type="submit" disabled={submitting}
              className="w-full bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
              {submitting ? "Gönderiliyor..." : "Teklifi Gönder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
