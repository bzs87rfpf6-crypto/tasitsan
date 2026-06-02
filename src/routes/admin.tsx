import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft, Phone, Mail, Calendar, Search, Package, Check, X as XIcon, Pencil, Trash2, Users as UsersIcon, LayoutDashboard, ClipboardList, AlertTriangle, MessageSquare, Settings as SettingsIcon, Crown, UserX, UserCheck, Save } from "lucide-react";
import tasitsanLogo from "@/assets/tasitsan-emblem.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminDeleteUser, adminSetActive, adminSetRole, adminUpdateProfile } from "@/lib/admin.functions";
import { StatCard } from "@/components/admin/StatCard";
import { SafePartImage } from "@/components/SafePartImage";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { ListingStatsPanel } from "@/components/admin/ListingStatsPanel";
import { UserAvatar } from "@/components/UserAvatar";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Yönetici Paneli — Taşıtsan" }] }),
  component: AdminPage,
});

type Status = "new" | "in_progress" | "resolved";
type PartStatus = "pending" | "approved" | "rejected";
type Tab = "dashboard" | "products" | "users" | "inquiries" | "requests" | "settings";

interface ProfileRow {
  id: string;
  display_name: string | null;
  whatsapp: string | null;
  city: string | null;
  email: string | null;
  created_at: string;
  is_active: boolean;
  is_approved: boolean;
  avatar_url: string | null;
}

interface SiteSettings {
  id: string;
  commission_rate: number;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  email_from_name: string | null;
  email_from_address: string | null;
  email_smtp_host: string | null;
  email_smtp_port: number | null;
  ga4_measurement_id: string | null;
  gsc_verification_code: string | null;
}

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
  part_name: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  oem_code: string | null;
  description: string | null;
  photos: string[] | null;
  message: string;
  status: Status;
  admin_notes: string | null;
  created_at: string;
}

interface RequestQuote {
  id: string;
  request_id: string;
  seller_id: string;
  price: number;
  delivery_time: string;
  condition: "new" | "used" | "refurbished";
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  seller?: { display_name: string | null } | null;
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
  const [tab, setTab] = useState<Tab>("dashboard");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [requests, setRequests] = useState<PartRequest[]>([]);
  const [quotes, setQuotes] = useState<RequestQuote[]>([]);
  const [parts, setParts] = useState<PartItem[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [reqSubTab, setReqSubTab] = useState<"open" | "awaiting" | "received" | "done">("open");
  const [reqSearch, setReqSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PartItem | null>(null);
  const [rejecting, setRejecting] = useState<PartItem | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [notingRequest, setNotingRequest] = useState<PartRequest | null>(null);
  const [editingUser, setEditingUser] = useState<ProfileRow | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", whatsapp: "", is_approved: false });
  const [savingEdit, setSavingEdit] = useState(false);

  const callDeleteUser = useServerFn(adminDeleteUser);
  const callSetRole = useServerFn(adminSetRole);
  const callSetActive = useServerFn(adminSetActive);
  const callUpdateProfile = useServerFn(adminUpdateProfile);

  useEffect(() => { if (!authLoading && !user) nav({ to: "/auth" }); }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (isAdmin === false) {
      toast.error("Bu alana erişim yetkin yok.");
      nav({ to: "/" });
    }
  }, [isAdmin, nav]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    const [iq, rq, pt, qt, us, rl, st] = await Promise.all([
      supabase.from("inquiries").select("*").order("created_at", { ascending: false }),
      supabase.from("part_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("parts").select("*").order("created_at", { ascending: false }),
      supabase.from("request_quotes").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,display_name,whatsapp,city,email,created_at,is_active,is_approved,avatar_url").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role").eq("role", "admin"),
      supabase.from("site_settings").select("*").maybeSingle(),
    ]);
    if (us.error) toast.error(us.error.message);
    setUsers((us.data ?? []) as ProfileRow[]);
    setAdminIds(new Set(((rl.data ?? []) as { user_id: string }[]).map((r) => r.user_id)));
    if (st.data) setSettings(st.data as SiteSettings);
    if (iq.error) toast.error(iq.error.message);
    if (rq.error) toast.error(rq.error.message);
    if (pt.error) toast.error(pt.error.message);
    if (qt.error) toast.error(qt.error.message);

    const inqs = (iq.data ?? []) as any[];
    const quoteRows = (qt.data ?? []) as any[];
    const partIds = Array.from(new Set(inqs.map((i) => i.part_id)));
    const buyerIds = Array.from(new Set(inqs.map((i) => i.buyer_id).filter(Boolean) as string[]));
    const quoteSellerIds = Array.from(new Set(quoteRows.map((q) => q.seller_id)));
    const sellerIds = Array.from(new Set([...(pt.data ?? []).map((p: any) => p.seller_id), ...quoteSellerIds]));

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
    setQuotes(quoteRows.map((q) => ({ ...q, seller: sellersMap.get(q.seller_id) ?? null })) as RequestQuote[]);
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

  const updateQuoteStatus = async (id: string, status: "pending" | "approved" | "rejected") => {
    const { error } = await supabase.from("request_quotes")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
    toast.success(status === "approved" ? "Teklif onaylandı, müşteriye iletilecek" : status === "rejected" ? "Teklif reddedildi" : "Teklif beklemeye alındı");
  };

  const updatePartStatus = async (id: string, status: PartStatus) => {
    const { error } = await supabase.from("parts")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    toast.success(status === "approved" ? "İlan onaylandı" : status === "rejected" ? "İlan reddedildi" : "Beklemede");
  };

  const deletePart = async (id: string) => {
    if (!confirm("Bu ilanı silmek istediğine emin misin?")) return;
    const { error } = await supabase.from("parts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setParts((prev) => prev.filter((p) => p.id !== id));
    toast.success("İlan silindi");
  };

  const handleDeleteUser = async (u: ProfileRow) => {
    if (!confirm(`${u.display_name ?? "Kullanıcı"} kalıcı olarak silinsin mi?`)) return;
    try {
      await callDeleteUser({ data: { userId: u.id } });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success("Kullanıcı silindi");
    } catch (e: any) { toast.error(e.message ?? "Silinemedi"); }
  };

  const handleRemoveAvatar = async (u: ProfileRow) => {
    if (!u.avatar_url) { toast.info("Bu kullanıcının profil fotoğrafı yok."); return; }
    if (!confirm(`${u.display_name ?? "Kullanıcı"} profil fotoğrafı kaldırılsın mı?`)) return;
    try {
      // Best-effort storage cleanup (admin RLS allows delete from avatars bucket)
      const match = u.avatar_url.match(/\/avatars\/([^?]+)/);
      if (match) {
        await supabase.storage.from("avatars").remove([match[1]]).catch(() => {});
      }
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", u.id);
      if (error) throw error;
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, avatar_url: null } : x));
      toast.success("Profil fotoğrafı kaldırıldı");
    } catch (e: any) { toast.error(e.message ?? "Kaldırılamadı"); }
  };

  const handleToggleActive = async (u: ProfileRow) => {
    try {
      await callSetActive({ data: { userId: u.id, isActive: !u.is_active } });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
      toast.success(!u.is_active ? "Kullanıcı aktifleştirildi" : "Kullanıcı pasife alındı");
    } catch (e: any) { toast.error(e.message ?? "Güncellenemedi"); }
  };

  const handleToggleApproved = async (u: ProfileRow) => {
    const next = !u.is_approved;
    const { error } = await supabase.from("profiles").update({ is_approved: next }).eq("id", u.id);
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_approved: next } : x));
    toast.success(next ? "Kullanıcı onaylandı" : "Onay geri alındı");
  };

  const handleToggleAdmin = async (u: ProfileRow) => {
    const isAdminNow = adminIds.has(u.id);
    try {
      await callSetRole({ data: { userId: u.id, makeAdmin: !isAdminNow } });
      setAdminIds((prev) => {
        const next = new Set(prev);
        if (isAdminNow) next.delete(u.id); else next.add(u.id);
        return next;
      });
      toast.success(isAdminNow ? "Admin yetkisi kaldırıldı" : "Admin yetkisi verildi");
    } catch (e: any) { toast.error(e.message ?? "Güncellenemedi"); }
  };

  const openEditUser = (u: ProfileRow) => {
    setEditingUser(u);
    setEditForm({
      display_name: u.display_name ?? "",
      whatsapp: u.whatsapp ?? "",
      is_approved: u.is_approved,
    });
  };

  const saveUserEdit = async () => {
    if (!editingUser) return;
    const name = editForm.display_name.trim();
    if (!name) { toast.error("Ad / firma adı boş olamaz"); return; }
    setSavingEdit(true);
    try {
      await callUpdateProfile({
        data: {
          userId: editingUser.id,
          displayName: name,
          whatsapp: editForm.whatsapp.trim() || null,
          isApproved: editForm.is_approved,
        },
      });
      setUsers((prev) => prev.map((x) => x.id === editingUser.id
        ? { ...x, display_name: name, whatsapp: editForm.whatsapp.trim() || null, is_approved: editForm.is_approved }
        : x));
      toast.success("Kullanıcı güncellendi");
      setEditingUser(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Bu işlem için yetkiniz yok");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleEditActive = async () => {
    if (!editingUser) return;
    const next = !editingUser.is_active;
    try {
      await callSetActive({ data: { userId: editingUser.id, isActive: next } });
      setUsers((prev) => prev.map((x) => x.id === editingUser.id ? { ...x, is_active: next } : x));
      setEditingUser({ ...editingUser, is_active: next });
      toast.success(next ? "Kullanıcı aktifleştirildi" : "Kullanıcı pasife alındı");
    } catch (e: any) {
      toast.error(e?.message ?? "Bu işlem için yetkiniz yok");
    }
  };

  const saveRequestNote = async (id: string, note: string) => {
    const { error } = await supabase.from("part_requests")
      .update({ admin_notes: note.trim() || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, admin_notes: note.trim() || null } as PartRequest : r));
    toast.success("Not kaydedildi");
  };

  const saveSettings = async (patch: Partial<SiteSettings>) => {
    if (!settings) return;
    const { data, error } = await supabase.from("site_settings")
      .update({ ...patch, updated_by: user?.id ?? null }).eq("id", settings.id).select().single();
    if (error) { toast.error(error.message); return; }
    setSettings(data as SiteSettings);
    toast.success("Ayarlar kaydedildi");
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.display_name, u.whatsapp, u.city, u.id].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }
  if (!isAdmin) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground"><ShieldCheck className="size-6 mr-2" />Yönlendiriliyor...</div>;
  }

  const pendingCount = parts.filter((p) => p.status === "pending").length;

  const filteredParts = filter === "all" ? parts : parts.filter((p) => p.status === filter);
  const filteredInquiries = filter === "all" ? inquiries : inquiries.filter((i) => i.status === filter);
  const quotesByRequest = new Map<string, RequestQuote[]>();
  quotes.forEach((q) => {
    const arr = quotesByRequest.get(q.request_id) ?? [];
    arr.push(q);
    quotesByRequest.set(q.request_id, arr);
  });
  const filteredRequests = requests.filter((r) => {
    const qs = quotesByRequest.get(r.id) ?? [];
    if (reqSubTab === "done" && r.status !== "resolved") return false;
    if (reqSubTab === "open" && !(r.status === "new" && qs.length === 0)) return false;
    if (reqSubTab === "awaiting" && !(r.status === "in_progress" && qs.length === 0)) return false;
    if (reqSubTab === "received" && !(qs.length > 0 && r.status !== "resolved")) return false;
    if (reqSearch.trim()) {
      const q = reqSearch.trim().toLowerCase();
      const hay = [r.part_name, r.oem_code, r.brand, r.model, r.full_name, r.phone, r.search_query]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });


  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="size-9 rounded-full bg-card grid place-items-center"><ArrowLeft className="size-4" /></Link>
          <img
            src={tasitsanLogo.url}
            alt="Taşıtsan"
            className="h-9 w-9 object-contain"
            width={36}
            height={36}
          />
          <div>
            <h1 className="font-display text-lg tracking-wide">Yönetici Paneli</h1>
            <p className="text-[11px] text-muted-foreground">
              {pendingCount} onay bekliyor · {inquiries.length} teklif · {requests.length} parça talebi
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 flex gap-1.5 border-b border-border overflow-x-auto">
          {([
            ["dashboard", "Panel"],
            ["products", `Ürünler${pendingCount ? ` (${pendingCount})` : ""}`],
            ["users", `Kullanıcılar (${users.length})`],
            ["inquiries", `Teklifler (${inquiries.length})`],
            ["requests", `Talepler (${requests.length})`],
            ["settings", "Ayarlar"],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); setFilter("all"); }}
              className={`shrink-0 px-3 py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? "border-gold text-gold" : "border-transparent text-muted-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {(tab === "products" || tab === "inquiries" || tab === "requests") && (
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto">
          {tab === "requests" ? (
            ([
              ["open", `Açık (${requests.filter((r) => r.status === "new" && !(quotesByRequest.get(r.id)?.length)).length})`],
              ["awaiting", `Teklif Bekleyen (${requests.filter((r) => r.status === "in_progress" && !(quotesByRequest.get(r.id)?.length)).length})`],
              ["received", `Teklif Gelen (${requests.filter((r) => (quotesByRequest.get(r.id)?.length ?? 0) > 0 && r.status !== "resolved").length})`],
              ["done", `Tamamlanan (${requests.filter((r) => r.status === "resolved").length})`],
            ] as ["open" | "awaiting" | "received" | "done", string][]).map(([s, label]) => (
              <button key={s} onClick={() => setReqSubTab(s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  reqSubTab === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
                }`}>{label}</button>
            ))
          ) : (
            (tab === "products"
              ? (["all", "pending", "approved", "rejected"] as const)
              : (["all", "new", "in_progress", "resolved"] as const)
            ).map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filter === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
                }`}>
                {s === "all" ? "Tümü" : tab === "products" ? PART_STATUS_LABEL[s as PartStatus] : STATUS_LABEL[s as Status]}
              </button>
            ))
          )}
        </div>
        )}

        {tab === "requests" && (
          <div className="max-w-2xl mx-auto px-4 pb-3">
            <div className="relative">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={reqSearch} onChange={(e) => setReqSearch(e.target.value)}
                placeholder="Talep ara: parça, OEM, marka, telefon..." className="pl-9 h-9 text-sm" />
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="relative">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Kullanıcı ara: isim, telefon, şehir..." className="pl-9 h-9 text-sm" />
            </div>
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
        ) : tab === "dashboard" ? (
          <div className="space-y-4">
            <AnalyticsDashboard />
            <ListingStatsPanel />
            <DashboardPanel
              users={users}
              parts={parts}
              inquiries={inquiries}
              requests={requests}
              onJump={(t) => { setTab(t); setFilter("all"); }}
            />
          </div>
        ) : tab === "users" ? (
          <UsersPanel
            users={filteredUsers}
            parts={parts}
            adminIds={adminIds}
            currentUserId={user?.id ?? null}
            onDelete={handleDeleteUser}
            onToggleActive={handleToggleActive}
            onToggleAdmin={handleToggleAdmin}
            onToggleApproved={handleToggleApproved}
            onEditName={openEditUser}
            onRemoveAvatar={handleRemoveAvatar}
          />
        ) : tab === "settings" ? (
          <SettingsPanel settings={settings} onSave={saveSettings} />
        ) : tab === "products" ? (
          filteredParts.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
          ) : filteredParts.map((p) => (
            <article key={p.id} className={`bg-card rounded-xl border p-3 sm:p-4 space-y-3 transition-shadow ${
              p.status === "pending"
                ? "border-gold/60 shadow-[0_0_0_1px_rgba(201,168,76,0.15)]"
                : "border-border"
            }`}>
              <div className="flex gap-3">
                <div className="size-20 sm:size-24 rounded-lg overflow-hidden bg-secondary shrink-0">
                  <SafePartImage images={p.photos} alt={p.title} width={320} />
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

              {p.status === "rejected" && p.admin_notes && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-[11px] leading-relaxed">
                  <div className="flex items-center gap-1.5 text-destructive font-semibold mb-1">
                    <MessageSquare className="size-3" /> Red nedeni (satıcıya iletilir)
                  </div>
                  {p.admin_notes}
                </div>
              )}

              {p.status === "pending" && (
                <div className="flex items-center gap-2 rounded-lg bg-gold/5 border border-gold/20 p-2.5">
                  <AlertTriangle className="size-4 text-gold shrink-0" />
                  <span className="text-[11px] text-gold">Bu ilan onay bekliyor. Onayla veya reddet.</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
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
                <Button size="sm" variant="outline" onClick={() => { setRejecting(p); setRejectNote(p.admin_notes || ""); }}
                  disabled={p.status === "rejected"}
                  className="h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
                  <XIcon className="size-3.5 mr-1" /> Reddet
                </Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => deletePart(p.id)}
                className="w-full h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
                <Trash2 className="size-3.5 mr-1" /> İlanı Sil
              </Button>
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
          ) : filteredRequests.map((r) => {
            const rqs = quotesByRequest.get(r.id) ?? [];
            return (
            <article key={r.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Search className="size-3.5 text-gold" />
                    <p className="font-semibold text-sm line-clamp-1">
                      {r.part_name || r.search_query || r.oem_code || `${r.brand ?? ""} ${r.model ?? ""}`.trim() || "Parça talebi"}
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

              {r.photos && r.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {r.photos.map((p, i) => (
                    <div key={`${p}-${i}`} className="size-16 rounded-lg overflow-hidden bg-secondary shrink-0">
                      <SafePartImage images={[p]} alt="" width={180} />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Talep eden" value={r.full_name} />
                <Field label="Telefon" value={r.phone} icon={<Phone className="size-3" />} />
                {r.email && <Field label="E-posta" value={r.email} icon={<Mail className="size-3" />} />}
                <Field label="Tarih" value={new Date(r.created_at).toLocaleString("tr-TR")} icon={<Calendar className="size-3" />} />
              </div>

              {(r.description || r.message) && (
                <div className="bg-background/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">{r.description || r.message}</div>
              )}

              {rqs.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <p className="text-[11px] uppercase tracking-wider text-gold font-semibold">{rqs.length} satıcı teklifi</p>
                  {rqs.map((q) => (
                    <div key={q.id} className="bg-background/60 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gold">₺{Number(q.price).toLocaleString("tr-TR")}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {q.seller?.display_name ?? "Satıcı"} · {q.condition === "new" ? "Sıfır" : q.condition === "used" ? "Çıkma" : "Revizyonlu"} · {q.delivery_time}
                          </p>
                          {q.note && <p className="text-[11px] mt-1">{q.note}</p>}
                        </div>
                        <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${
                          q.status === "approved" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                          : q.status === "rejected" ? "bg-destructive/15 text-destructive border-destructive/40"
                          : "bg-gold/15 text-gold border-gold/40"
                        }`}>
                          {q.status === "approved" ? "Onaylı" : q.status === "rejected" ? "Reddedildi" : "Beklemede"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Button size="sm" disabled={q.status === "approved"} onClick={() => updateQuoteStatus(q.id, "approved")}
                          className="h-8 text-[11px] bg-emerald-500/90 hover:bg-emerald-500 text-white">
                          <Check className="size-3 mr-1" /> Onayla
                        </Button>
                        <Button size="sm" variant="outline" disabled={q.status === "pending"} onClick={() => updateQuoteStatus(q.id, "pending")}
                          className="h-8 text-[11px]">Beklet</Button>
                        <Button size="sm" variant="outline" disabled={q.status === "rejected"} onClick={() => updateQuoteStatus(q.id, "rejected")}
                          className="h-8 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10">
                          <XIcon className="size-3 mr-1" /> Reddet
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}


              {r.admin_notes && (
                <div className="rounded-lg border border-gold/30 bg-gold/5 p-2.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-gold font-semibold mb-1">
                    <MessageSquare className="size-3" /> Admin notu
                  </div>
                  <p className="whitespace-pre-wrap">{r.admin_notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {(["new", "in_progress", "resolved"] as Status[]).map((s) => (
                  <Button key={s} type="button" variant={r.status === s ? "default" : "outline"}
                    onClick={() => updateRequestStatus(r.id, s)}
                    className={`flex-1 h-9 text-xs ${r.status === s ? "bg-gold-gradient text-gold-foreground hover:opacity-90" : ""}`}>
                    {STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setNotingRequest(r)}
                className="w-full h-9 text-xs">
                <MessageSquare className="size-3.5 mr-1" /> {r.admin_notes ? "Notu Düzenle" : "Not Ekle"}
              </Button>
            </article>
            );
          })
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

      <RejectDialog
        part={rejecting}
        note={rejectNote}
        onNoteChange={setRejectNote}
        onClose={() => setRejecting(null)}
        onConfirm={async (id, note) => {
          const { error } = await supabase.from("parts")
            .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null, admin_notes: note.trim() || null })
            .eq("id", id);
          if (error) { toast.error(error.message); return; }
          setParts((prev) => prev.map((p) => (p.id === id ? { ...p, status: "rejected", admin_notes: note.trim() || null } : p)));
          setRejecting(null);
          setRejectNote("");
          toast.success("İlan reddedildi");
        }}
      />

      <RequestNoteDialog
        request={notingRequest}
        onClose={() => setNotingRequest(null)}
        onSave={async (id, note) => {
          await saveRequestNote(id, note);
          setNotingRequest(null);
        }}
      />

      <Dialog open={!!editingUser} onOpenChange={(v) => { if (!v) setEditingUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Değişiklikler tüm sistemde anında görünür ve işlem kaydı tutulur.
            </p>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Ad / Firma Adı</label>
              <Input
                autoFocus
                value={editForm.display_name}
                onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="Ad Soyad veya firma adı"
                maxLength={100}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Telefon (WhatsApp)</label>
              <Input
                type="tel"
                value={editForm.whatsapp}
                onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
                placeholder="5xx xxx xx xx"
                maxLength={32}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Üyelik Durumu</label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" size="sm"
                  variant={editForm.is_approved ? "default" : "outline"}
                  onClick={() => setEditForm((f) => ({ ...f, is_approved: true }))}
                  className={`h-8 text-[11px] ${editForm.is_approved ? "bg-gold-gradient text-gold-foreground" : ""}`}>
                  <Check className="size-3 mr-1" /> Onaylı
                </Button>
                <Button type="button" size="sm"
                  variant={!editForm.is_approved ? "default" : "outline"}
                  onClick={() => setEditForm((f) => ({ ...f, is_approved: false }))}
                  className={`h-8 text-[11px] ${!editForm.is_approved ? "bg-gold-gradient text-gold-foreground" : ""}`}>
                  <XIcon className="size-3 mr-1" /> Onay Bekliyor
                </Button>
              </div>
            </div>
            {editingUser && (
              <div className="space-y-1.5 pt-1 border-t border-border">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hesap Erişimi</label>
                <Button type="button" size="sm" variant="outline" onClick={toggleEditActive}
                  disabled={user?.id === editingUser.id}
                  className={`w-full h-8 text-[11px] ${!editingUser.is_active ? "border-destructive/40 text-destructive" : ""}`}>
                  {editingUser.is_active
                    ? <><UserX className="size-3 mr-1" /> Pasife Al</>
                    : <><UserCheck className="size-3 mr-1" /> Tekrar Aktif Et</>}
                </Button>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingUser(null)} disabled={savingEdit}>
                İptal
              </Button>
              <Button size="sm" onClick={saveUserEdit} disabled={savingEdit}
                className="bg-gold-gradient text-gold-foreground font-semibold">
                <Save className="size-3.5 mr-1" /> {savingEdit ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

function RejectDialog({
  part, note, onNoteChange, onClose, onConfirm,
}: {
  part: PartItem | null;
  note: string;
  onNoteChange: (v: string) => void;
  onClose: () => void;
  onConfirm: (id: string, note: string) => void;
}) {
  if (!part) return null;
  return (
    <Dialog open={!!part} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide text-destructive flex items-center gap-2">
            <XIcon className="size-5" /> İlanı Reddet
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-background/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold">{part.title}</p>
            <p className="text-[11px] text-muted-foreground">{[part.brand, part.model, part.year].filter(Boolean).join(" • ")}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Red nedeni (isteğe bağlı — satıcıya iletilir)</label>
            <Textarea
              placeholder="Örn: Fotoğraf net değil, OEM kodu eksik, uyumsuz kategori..."
              rows={3}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              className="resize-none text-xs"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-xs">İptal</Button>
            <Button
              onClick={() => onConfirm(part.id, note)}
              className="flex-1 h-9 text-xs bg-destructive hover:bg-destructive/90 text-white"
            >
              <XIcon className="size-3.5 mr-1" /> Reddet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function DashboardPanel({
  users, parts, inquiries, requests, onJump,
}: {
  users: ProfileRow[];
  parts: PartItem[];
  inquiries: Inquiry[];
  requests: PartRequest[];
  onJump: (t: Tab) => void;
}) {
  const pending = parts.filter((p) => p.status === "pending").length;
  const pendingUsers = users.filter((u) => !u.is_approved).length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const newToday = users.filter((u) => new Date(u.created_at) >= todayStart).length;
  const partsToday = parts.filter((p) => new Date(p.created_at) >= todayStart).length;

  type Activity = { id: string; type: string; title: string; when: string; tab: Tab };
  const activity: Activity[] = [
    ...parts.slice(0, 10).map((p) => ({ id: `p-${p.id}`, type: "Yeni ilan", title: p.title, when: p.created_at, tab: "products" as Tab })),
    ...inquiries.slice(0, 10).map((i) => ({ id: `i-${i.id}`, type: "Teklif talebi", title: i.full_name, when: i.created_at, tab: "inquiries" as Tab })),
    ...requests.slice(0, 10).map((r) => ({ id: `r-${r.id}`, type: "Parça talebi", title: r.part_name || r.search_query || r.full_name, when: r.created_at, tab: "requests" as Tab })),
  ].sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => onJump("users")} className="text-left">
          <StatCard icon={<UsersIcon className="size-3.5" />} label="Toplam Kullanıcı" value={users.length} />
        </button>
        <button onClick={() => onJump("users")} className="text-left">
          <StatCard icon={<UserCheck className="size-3.5" />} label="Onay Bekleyen Kullanıcı" value={pendingUsers} accent="text-gold" />
        </button>
        <button onClick={() => onJump("products")} className="text-left">
          <StatCard icon={<Package className="size-3.5" />} label="Toplam İlan" value={parts.length} />
        </button>
        <button onClick={() => onJump("requests")} className="text-left">
          <StatCard icon={<Search className="size-3.5" />} label="Toplam Talep" value={requests.length} />
        </button>
        <button onClick={() => onJump("products")} className="text-left">
          <StatCard icon={<ClipboardList className="size-3.5" />} label="Onay Bekleyen" value={pending} accent="text-gold" />
        </button>
        <button onClick={() => onJump("users")} className="text-left">
          <StatCard icon={<Calendar className="size-3.5" />} label="Bugün Yeni Kullanıcı" value={newToday} accent="text-emerald-400" />
        </button>
        <button onClick={() => onJump("products")} className="text-left">
          <StatCard icon={<Calendar className="size-3.5" />} label="Bugün Yeni İlan" value={partsToday} accent="text-emerald-400" />
        </button>
        <button onClick={() => onJump("inquiries")} className="text-left">
          <StatCard icon={<Mail className="size-3.5" />} label="Teklif Talebi" value={inquiries.length} />
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="size-4 text-gold" />
          <h2 className="font-semibold text-sm">Son Aktivite</h2>
        </div>
        {activity.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Henüz aktivite yok.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((a) => (
              <li key={a.id}>
                <button onClick={() => onJump(a.tab)} className="w-full text-left py-2.5 flex items-start justify-between gap-3 hover:opacity-80">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gold">{a.type}</p>
                    <p className="text-xs font-medium truncate">{a.title}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(a.when).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UsersPanel({
  users, parts, adminIds, currentUserId, onDelete, onToggleActive, onToggleAdmin, onToggleApproved, onEditName, onRemoveAvatar,
}: {
  users: ProfileRow[];
  parts: PartItem[];
  adminIds: Set<string>;
  currentUserId: string | null;
  onDelete: (u: ProfileRow) => void;
  onToggleActive: (u: ProfileRow) => void;
  onToggleAdmin: (u: ProfileRow) => void;
  onToggleApproved: (u: ProfileRow) => void;
  onEditName: (u: ProfileRow) => void;
  onRemoveAvatar: (u: ProfileRow) => void;
}) {
  const listingsBySeller = new Map<string, number>();
  parts.forEach((p) => listingsBySeller.set(p.seller_id, (listingsBySeller.get(p.seller_id) ?? 0) + 1));
  if (users.length === 0) return <p className="text-center text-muted-foreground text-sm py-8">Kullanıcı yok.</p>;

  // Surface pending-approval accounts at the top
  const sorted = [...users].sort((a, b) => Number(a.is_approved) - Number(b.is_approved));

  return (
    <div className="space-y-2">
      {sorted.map((u) => {
        const isUserAdmin = adminIds.has(u.id);
        const isSelf = currentUserId === u.id;
        const approved = u.is_approved || isUserAdmin;
        return (
          <div key={u.id} className={`bg-card rounded-xl border p-3 space-y-3 ${
            !approved ? "border-gold/60 shadow-[0_0_0_1px_rgba(201,168,76,0.15)]"
              : u.is_active ? "border-border" : "border-destructive/40 opacity-75"
          }`}>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-gold-gradient text-gold-foreground grid place-items-center font-bold shrink-0">
                {(u.display_name ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold text-sm truncate">{u.display_name ?? "İsimsiz"}</p>
                  {isUserAdmin && <Crown className="size-3.5 text-gold shrink-0" />}
                  {!approved && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/40">Onay Bekliyor</span>}
                  {!u.is_active && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/40">Pasif</span>}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[u.city, u.whatsapp, u.email].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("tr-TR")} · {listingsBySeller.get(u.id) ?? 0} ilan
                </p>
              </div>
            </div>
            {!approved && (
              <Button size="sm" onClick={() => onToggleApproved(u)}
                className="w-full h-9 text-xs bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                <Check className="size-3.5 mr-1" /> Hesabı Onayla
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onEditName(u)}
              className="w-full h-8 text-[11px]">
              <Pencil className="size-3 mr-1" /> Kullanıcı Düzenle
            </Button>
            <div className="grid grid-cols-4 gap-1.5">
              {approved && !isUserAdmin && (
                <Button size="sm" variant="outline" onClick={() => onToggleApproved(u)} disabled={isSelf}
                  className="h-8 text-[11px]">
                  <XIcon className="size-3 mr-1" /> Onayı Kaldır
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onToggleAdmin(u)} disabled={isSelf && isUserAdmin}
                className={`h-8 text-[11px] ${isUserAdmin ? "border-gold/40 text-gold" : ""}`}>
                <Crown className="size-3 mr-1" /> {isUserAdmin ? "Admin Kaldır" : "Admin Yap"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onToggleActive(u)} disabled={isSelf}
                className="h-8 text-[11px]">
                {u.is_active ? <><UserX className="size-3 mr-1" />Pasifle</> : <><UserCheck className="size-3 mr-1" />Aktifle</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDelete(u)} disabled={isSelf}
                className="h-8 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10">
                <Trash2 className="size-3 mr-1" /> Sil
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({ settings, onSave }: { settings: SiteSettings | null; onSave: (patch: Partial<SiteSettings>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<SiteSettings>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (!settings) return <p className="text-center text-muted-foreground text-sm py-8">Ayarlar yükleniyor...</p>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      commission_rate: Number(form.commission_rate ?? 0),
      contact_email: form.contact_email?.toString().trim() || null,
      contact_phone: form.contact_phone?.toString().trim() || null,
      contact_address: form.contact_address?.toString().trim() || null,
      email_from_name: form.email_from_name?.toString().trim() || null,
      email_from_address: form.email_from_address?.toString().trim() || null,
      email_smtp_host: form.email_smtp_host?.toString().trim() || null,
      email_smtp_port: form.email_smtp_port ? Number(form.email_smtp_port) : null,
      ga4_measurement_id: form.ga4_measurement_id?.toString().trim() || null,
      gsc_verification_code: form.gsc_verification_code?.toString().trim() || null,
    });
    setSaving(false);
  };

  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="size-4 text-gold" />
          <h2 className="font-semibold text-sm">Komisyon</h2>
        </div>
        <label className="block">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Komisyon Oranı (%)</span>
          <Input type="number" step="0.1" min="0" max="100" value={form.commission_rate ?? 0}
            onChange={(e) => set("commission_rate", Number(e.target.value))} className="mt-1 h-9" />
        </label>
      </section>

      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Phone className="size-4 text-gold" />
          <h2 className="font-semibold text-sm">İletişim Bilgileri</h2>
        </div>
        <label className="block">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">E-posta</span>
          <Input type="email" value={form.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} className="mt-1 h-9" placeholder="info@tasitsan.com.tr" />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Telefon</span>
          <Input value={form.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} className="mt-1 h-9" placeholder="+90 ..." />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Adres</span>
          <Textarea rows={2} value={form.contact_address ?? ""} onChange={(e) => set("contact_address", e.target.value)} className="mt-1 resize-none" />
        </label>
      </section>

      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-gold" />
          <h2 className="font-semibold text-sm">E-posta Ayarları</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Gönderen Adı</span>
            <Input value={form.email_from_name ?? ""} onChange={(e) => set("email_from_name", e.target.value)} className="mt-1 h-9" />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Gönderen Adresi</span>
            <Input type="email" value={form.email_from_address ?? ""} onChange={(e) => set("email_from_address", e.target.value)} className="mt-1 h-9" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block col-span-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">SMTP Host</span>
            <Input value={form.email_smtp_host ?? ""} onChange={(e) => set("email_smtp_host", e.target.value)} className="mt-1 h-9" placeholder="smtp.example.com" />
          </label>
          <label className="block">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Port</span>
            <Input type="number" value={form.email_smtp_port ?? ""} onChange={(e) => set("email_smtp_port", e.target.value ? Number(e.target.value) : null)} className="mt-1 h-9" placeholder="587" />
          </label>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-4 text-gold" />
          <h2 className="font-semibold text-sm">SEO & Analitik</h2>
        </div>
        <label className="block">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Google Analytics 4 — Measurement ID</span>
          <Input value={form.ga4_measurement_id ?? ""} onChange={(e) => set("ga4_measurement_id", e.target.value)} className="mt-1 h-9 font-mono" placeholder="G-XXXXXXXXXX" />
          <span className="text-[10px] text-muted-foreground mt-1 block">GA4 ölçüm kimliğinizi girdiğinizde site etkinlikleri otomatik olarak Google'a iletilir.</span>
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Google Search Console Doğrulama Kodu</span>
          <Input value={form.gsc_verification_code ?? ""} onChange={(e) => set("gsc_verification_code", e.target.value)} className="mt-1 h-9 font-mono" placeholder="abc123..." />
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Search Console &gt; HTML etiketi yönteminde verilen <code>content</code> değerini buraya yapıştırın. Sitenizin <code>&lt;head&gt;</code> bölümüne otomatik eklenir.
            Sitemap: <code>https://tasitsan.com.tr/sitemap.xml</code>
          </span>
        </label>
      </section>

      <Button type="submit" disabled={saving} className="w-full bg-gold-gradient text-gold-foreground font-semibold shadow-gold">

        <Save className="size-4 mr-1.5" /> {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
      </Button>
    </form>
  );
}

function RequestNoteDialog({
  request, onClose, onSave,
}: {
  request: PartRequest | null;
  onClose: () => void;
  onSave: (id: string, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNote(request?.admin_notes ?? ""); }, [request]);
  if (!request) return null;
  return (
    <Dialog open={!!request} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Talep Notu</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-background/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold">{request.part_name || request.search_query || "Parça talebi"}</p>
            <p className="text-[11px] text-muted-foreground">{[request.brand, request.model, request.year].filter(Boolean).join(" • ")}</p>
          </div>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bu talep hakkında dahili not..." className="resize-none text-xs" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-xs">İptal</Button>
            <Button onClick={async () => { setSaving(true); await onSave(request.id, note); setSaving(false); }}
              disabled={saving}
              className="flex-1 h-9 text-xs bg-gold-gradient text-gold-foreground">
              <Save className="size-3.5 mr-1" /> {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

