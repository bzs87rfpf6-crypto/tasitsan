import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft, Phone, Mail, Calendar, Search, Package, Check, X as XIcon, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Yönetici Paneli — Taşıtsan" }] }),
  component: AdminPage,
});

type Status = "new" | "in_progress" | "resolved";
type PartStatus = "pending" | "approved" | "rejected";
type Tab = "products" | "inquiries" | "requests";

interface Inquiry {
  id: string;
  part_id: string;
  buyer_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  company: string | null;
  message: string;
  status: Status;
  created_at: string;
  part?: { title: string; brand: string | null; model: string | null; whatsapp: string; city: string | null; seller_id: string } | null;
  buyer?: { display_name: string | null } | null;
  seller?: { display_name: string | null; whatsapp: string | null } | null;
}

interface PartRequest {
  id: string;
  buyer_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  search_query: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  oem_code: string | null;
  message: string;
  status: Status;
  created_at: string;
}

interface PartItem {
  id: string;
  title: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  oem_code: string | null;
  category: string | null;
  price: number | null;
  stock_quantity: number | null;
  city: string | null;
  photos: string[];
  status: PartStatus;
  admin_notes: string | null;
  created_at: string;
  seller_id: string;
  seller?: { display_name: string | null; whatsapp: string | null } | null;
}

const STATUS_LABEL: Record<Status, string> = {
  new: "Yeni",
  in_progress: "Görüşülüyor",
  resolved: "Sonuçlandı",
};

const STATUS_COLOR: Record<Status, string> = {
  new: "bg-gold/15 text-gold border-gold/40",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

const PART_STATUS_LABEL: Record<PartStatus, string> = {
  pending: "Beklemede",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

const PART_STATUS_COLOR: Record<PartStatus, string> = {
  pending: "bg-gold/15 text-gold border-gold/40",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  rejected: "bg-destructive/15 text-destructive border-destructive/40",
};

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [requests, setRequests] = useState<PartRequest[]>([]);
  const [parts, setParts] = useState<PartItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PartItem | null>(null);

  useEffect(() => { if (!authLoading && !user) nav({ to: "/auth" }); }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    const [iq, rq, pt] = await Promise.all([
      supabase.from("inquiries").select("*").order("created_at", { ascending: false }),
      supabase.from("part_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("parts").select("*").order("created_at", { ascending: false }),
    ]);
    if (iq.error) toast.error(iq.error.message);
    if (rq.error) toast.error(rq.error.message);
    if (pt.error) toast.error(pt.error.message);

    const inqs = (iq.data ?? []) as any[];
    const partIds = Array.from(new Set(inqs.map((i) => i.part_id)));
    const buyerIds = Array.from(new Set(inqs.map((i) => i.buyer_id).filter(Boolean) as string[]));
    const sellerIds = Array.from(new Set([...(pt.data ?? []).map((p: any) => p.seller_id)]));

    const [partsRes, buyersRes, sellersRes] = await Promise.all([
      partIds.length
        ? supabase.from("parts").select("id,title,brand,model,whatsapp,city,seller_id").in("id", partIds)
        : Promise.resolve({ data: [] as any[] }),
      buyerIds.length
        ? supabase.from("profiles").select("id,display_name").in("id", buyerIds)
        : Promise.resolve({ data: [] as any[] }),
      sellerIds.length
        ? supabase.from("profiles").select("id,display_name,whatsapp").in("id", sellerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const partsMap = new Map((partsRes.data ?? []).map((p: any) => [p.id, p]));
    const buyersMap = new Map((buyersRes.data ?? []).map((p: any) => [p.id, p]));
    const sellersMap = new Map((sellersRes.data ?? []).map((p: any) => [p.id, p]));

    setInquiries(inqs.map((i: any) => {
      const part = partsMap.get(i.part_id);
      return {
        ...i,
        part: part ?? null,
        buyer: i.buyer_id ? buyersMap.get(i.buyer_id) ?? null : null,
        seller: part ? sellersMap.get(part.seller_id) ?? null : null,
      };
    }));
    setRequests((rq.data ?? []) as PartRequest[]);
    setParts(((pt.data ?? []) as any[]).map((p) => ({ ...p, seller: sellersMap.get(p.seller_id) ?? null })) as PartItem[]);
    setLoading(false);
  };

  const updateInquiryStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("inquiries").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    toast.success("Durum güncellendi");
  };

  const updateRequestStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("part_requests").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRequests((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    toast.success("Durum güncellendi");
  };

  const updatePartStatus = async (id: string, status: PartStatus) => {
    const { error } = await supabase.from("parts")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    toast.success(status === "approved" ? "İlan onaylandı" : status === "rejected" ? "İlan reddedildi" : "Beklemede");
  };

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <ShieldCheck className="size-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Bu alana erişim yetkin yok.</p>
          <Link to="/" className="text-gold mt-3 inline-block text-sm">← Anasayfaya dön</Link>
        </div>
      </div>
    );
  }

  const pendingCount = parts.filter((p) => p.status === "pending").length;

  const filteredParts = filter === "all" ? parts : parts.filter((p) => p.status === filter);
  const filteredInquiries = filter === "all" ? inquiries : inquiries.filter((i) => i.status === filter);
  const filteredRequests = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="size-9 rounded-full bg-card grid place-items-center"><ArrowLeft className="size-4" /></Link>
          <div>
            <h1 className="font-display text-lg tracking-wide">Yönetici Paneli</h1>
            <p className="text-[11px] text-muted-foreground">
              {pendingCount} onay bekliyor · {inquiries.length} teklif · {requests.length} parça talebi
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 flex gap-1.5 border-b border-border overflow-x-auto">
          {([
            ["products", `Ürün Onayları${pendingCount ? ` (${pendingCount})` : ""}`],
            ["inquiries", `Teklif Talepleri (${inquiries.length})`],
            ["requests", `Parça Talepleri (${requests.length})`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); setFilter("all"); }}
              className={`shrink-0 px-3 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? "border-gold text-gold" : "border-transparent text-muted-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto">
          {(tab === "products"
            ? (["all", "pending", "approved", "rejected"] as const)
            : (["all", "new", "in_progress", "resolved"] as const)
          ).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
              }`}>
              {s === "all" ? "Tümü" : tab === "products" ? PART_STATUS_LABEL[s as PartStatus] : STATUS_LABEL[s as Status]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
        ) : tab === "products" ? (
          filteredParts.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
          ) : filteredParts.map((p) => (
            <article key={p.id} className="bg-card rounded-xl border border-border p-3 sm:p-4 space-y-3">
              <div className="flex gap-3">
                <div className="size-20 sm:size-24 rounded-lg overflow-hidden bg-secondary shrink-0">
                  {p.photos?.[0] ? (
                    <img src={p.photos[0]} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center"><Package className="size-6 text-muted-foreground" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight line-clamp-2">{p.title}</h3>
                    <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${PART_STATUS_COLOR[p.status]}`}>
                      {PART_STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {[p.brand, p.model, p.year].filter(Boolean).join(" • ") || "—"}
                  </p>
                  {p.oem_code && <p className="text-[10px] font-mono text-muted-foreground/80">OEM: {p.oem_code}</p>}
                  <div className="flex items-center gap-3 pt-0.5">
                    <span className="text-gold font-bold text-sm">{p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "—"}</span>
                    <span className="text-[11px] text-muted-foreground">Stok: {p.stock_quantity ?? 0}</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                <span>Satıcı: <span className="text-foreground">{p.seller?.display_name ?? "—"}</span></span>
                <span>Kategori: <span className="text-foreground">{p.category ?? "—"}</span></span>
                <span><Calendar className="inline size-3 mr-0.5" />{new Date(p.created_at).toLocaleDateString("tr-TR")}</span>
              </div>

              {p.description && (
                <div className="bg-background/50 rounded-lg p-2.5 text-[11px] leading-relaxed line-clamp-3">{p.description}</div>
              )}

              <div className="grid grid-cols-4 gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)} className="h-9 text-xs">
                  <Pencil className="size-3.5 mr-1" /> Düzenle
                </Button>
                <Button size="sm" onClick={() => updatePartStatus(p.id, "approved")}
                  disabled={p.status === "approved"}
                  className="h-9 text-xs bg-emerald-500/90 hover:bg-emerald-500 text-white">
                  <Check className="size-3.5 mr-1" /> Onayla
                </Button>
                <Button size="sm" variant="outline" onClick={() => updatePartStatus(p.id, "pending")}
                  disabled={p.status === "pending"}
                  className="h-9 text-xs">
                  Beklet
                </Button>
                <Button size="sm" variant="outline" onClick={() => updatePartStatus(p.id, "rejected")}
                  disabled={p.status === "rejected"}
                  className="h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
                  <XIcon className="size-3.5 mr-1" /> Reddet
                </Button>
              </div>
            </article>
          ))
        ) : tab === "inquiries" ? (
          filteredInquiries.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
          ) : filteredInquiries.map((i) => (
            <article key={i.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to="/parts/$id" params={{ id: i.part_id }}
                    className="font-semibold text-sm hover:text-gold transition-colors line-clamp-1">
                    {i.part?.title ?? "Silinmiş ilan"}
                  </Link>
                  {i.part && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[i.part.brand, i.part.model, i.part.city].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${STATUS_COLOR[i.status]}`}>
                  {STATUS_LABEL[i.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Talep eden" value={i.full_name} />
                <Field label="Telefon" value={i.phone} icon={<Phone className="size-3" />} />
                {i.email && <Field label="E-posta" value={i.email} icon={<Mail className="size-3" />} />}
                <Field label="Tarih" value={new Date(i.created_at).toLocaleString("tr-TR")} icon={<Calendar className="size-3" />} />
              </div>

              <div className="bg-background/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">{i.message}</div>

              {i.part && (
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-[11px] space-y-1">
                  <p className="text-gold font-semibold uppercase tracking-wider">Satıcı bilgileri (sadece admin)</p>
                  <p>{i.seller?.display_name ?? "—"} · {i.seller?.whatsapp ?? i.part.whatsapp}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {(["new", "in_progress", "resolved"] as Status[]).map((s) => (
                  <Button key={s} type="button" variant={i.status === s ? "default" : "outline"}
                    onClick={() => updateInquiryStatus(i.id, s)}
                    className={`flex-1 h-9 text-xs ${i.status === s ? "bg-gold-gradient text-gold-foreground hover:opacity-90" : ""}`}>
                    {STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
            </article>
          ))
        ) : (
          filteredRequests.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
          ) : filteredRequests.map((r) => (
            <article key={r.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Search className="size-3.5 text-gold" />
                    <p className="font-semibold text-sm line-clamp-1">
                      {r.search_query || r.oem_code || `${r.brand ?? ""} ${r.model ?? ""}`.trim() || "Parça talebi"}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {[r.brand, r.model, r.year, r.category].filter(Boolean).join(" • ")}
                  </p>
                  {r.oem_code && <p className="text-[10px] font-mono text-muted-foreground/80 mt-0.5">OEM: {r.oem_code}</p>}
                </div>
                <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${STATUS_COLOR[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Talep eden" value={r.full_name} />
                <Field label="Telefon" value={r.phone} icon={<Phone className="size-3" />} />
                {r.email && <Field label="E-posta" value={r.email} icon={<Mail className="size-3" />} />}
                <Field label="Tarih" value={new Date(r.created_at).toLocaleString("tr-TR")} icon={<Calendar className="size-3" />} />
              </div>

              <div className="bg-background/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">{r.message}</div>

              <div className="flex gap-2 pt-1">
                {(["new", "in_progress", "resolved"] as Status[]).map((s) => (
                  <Button key={s} type="button" variant={r.status === s ? "default" : "outline"}
                    onClick={() => updateRequestStatus(r.id, s)}
                    className={`flex-1 h-9 text-xs ${r.status === s ? "bg-gold-gradient text-gold-foreground hover:opacity-90" : ""}`}>
                    {STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
            </article>
          ))
        )}
      </main>

      <EditPartDialog
        part={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setParts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
          setEditing(null);
        }}
      />
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-background/50 rounded-lg p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-0.5">
        {icon && <span className="text-gold">{icon}</span>}{label}
      </div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

function EditPartDialog({
  part, onClose, onSaved,
}: {
  part: PartItem | null;
  onClose: () => void;
  onSaved: (updated: Partial<PartItem> & { id: string }) => void;
}) {
  const [form, setForm] = useState({
    title: "", brand: "", model: "", year: "", oem_code: "",
    category: "", price: "", stock_quantity: "", description: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!part) return;
    setForm({
      title: part.title ?? "",
      brand: part.brand ?? "",
      model: part.model ?? "",
      year: part.year ? String(part.year) : "",
      oem_code: part.oem_code ?? "",
      category: part.category ?? "",
      price: part.price != null ? String(part.price) : "",
      stock_quantity: part.stock_quantity != null ? String(part.stock_quantity) : "",
      description: part.description ?? "",
    });
  }, [part]);

  if (!part) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const patch = {
      title: form.title.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      year: form.year ? parseInt(form.year) : null,
      oem_code: form.oem_code.trim() || null,
      category: form.category.trim() || null,
      price: form.price ? parseFloat(form.price) : null,
      stock_quantity: form.stock_quantity ? Math.max(0, parseInt(form.stock_quantity)) : 0,
      description: form.description.trim() || null,
    };
    const { error } = await supabase.from("parts").update(patch).eq("id", part.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ürün güncellendi");
    onSaved({ id: part.id, ...patch });
  };

  return (
    <Dialog open={!!part} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Ürünü Düzenle</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-2.5">
          <Input placeholder="Parça Adı" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Marka" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <Input placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Yıl" inputMode="numeric" value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            <Input placeholder="Kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <Input placeholder="OEM Kodu" className="font-mono" value={form.oem_code}
            onChange={(e) => setForm({ ...form, oem_code: e.target.value.toUpperCase() })} maxLength={60} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Fiyat ₺" inputMode="decimal" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })} />
            <Input placeholder="Stok" inputMode="numeric" value={form.stock_quantity}
              onChange={(e) => setForm({ ...form, stock_quantity: e.target.value.replace(/\D/g, "") })} />
          </div>
          <Textarea placeholder="Açıklama" rows={4} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} className="resize-none" />
          <Button type="submit" disabled={saving} className="w-full bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
            {saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
