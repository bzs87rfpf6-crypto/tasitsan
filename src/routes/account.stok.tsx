import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Plus, Trash2, Upload, FileText, Image as ImageIcon, Package } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";

type TabKey = "create" | "mine" | "offers";

export const Route = createFileRoute("/account/stok")({
  head: () => ({ meta: [{ title: "Taşıtsan Stok Borsası" }, { name: "robots", content: "noindex,nofollow" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey } => {
    const t = s.tab;
    return t === "create" || t === "mine" || t === "offers" ? { tab: t } : {};
  },
  component: StokPage,
});

type Listing = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  estimated_item_count: number | null;
  estimated_oem_count: number | null;
  expected_price: number | null;
  status: string;
  expert_requested: boolean;
  files: { name: string; path: string; type: string }[];
  images: { name: string; path: string }[];
  created_at: string;
  admin_note: string | null;
};

type Offer = {
  id: string;
  listing_id: string;
  buyer_id: string;
  offer_amount: number;
  note: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "text-muted-foreground border-border bg-background/40" },
  pending_review: { label: "İnceleniyor", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  active: { label: "Yayında", cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  offer_collecting: { label: "Teklif topluyor", cls: "text-sky-400 border-sky-400/40 bg-sky-400/10" },
  sold: { label: "Satıldı", cls: "text-gold border-gold/40 bg-gold/10" },
  cancelled: { label: "İptal", cls: "text-rose-400 border-rose-400/40 bg-rose-400/10" },
};

const ACCEPT = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp";

function StokPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/account/stok" });
  const [tab, setTab] = useState<TabKey>(search.tab ?? "mine");
  const [listings, setListings] = useState<Listing[]>([]);
  const [offers, setOffers] = useState<Record<string, Offer[]>>({});
  const [busy, setBusy] = useState(false);

  function openTab(next: TabKey) {
    console.info("[stok-borsasi] tab click", { from: tab, to: next });
    setTab(next);
    void navigate({ search: (prev: { tab?: TabKey }) => ({ ...prev, tab: next }) });
  }

  async function load() {
    if (!user) return;
    const { data, error } = await supabase
      .from("stok_listings")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as unknown as Listing[];
    setListings(rows);
    if (rows.length) {
      const { data: ofs } = await supabase
        .from("stok_offers")
        .select("*")
        .in("listing_id", rows.map(r => r.id))
        .order("created_at", { ascending: false });
      const grouped: Record<string, Offer[]> = {};
      (ofs ?? []).forEach((o: Offer) => {
        (grouped[o.listing_id] ??= []).push(o);
      });
      setOffers(grouped);
    }
  }

  useEffect(() => { void load(); }, [user?.id]);

  useEffect(() => {
    console.info("[stok-borsasi] account/stok state", {
      loading,
      hasUser: Boolean(user),
      userId: user?.id ?? null,
      searchTab: search.tab ?? null,
      activeTab: tab,
    });
  }, [loading, user?.id, search.tab, tab]);

  useEffect(() => {
    if (search.tab && search.tab !== tab) {
      console.info("[stok-borsasi] syncing tab from url", { from: tab, to: search.tab });
      setTab(search.tab);
    }
  }, [search.tab, tab]);

  if (loading) return <FullLoader />;
  if (!user) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <AppHeader />
        <div className="max-w-2xl mx-auto p-6 text-center space-y-3">
          <p>Bu sayfayı görmek için giriş yapın.</p>
          <Link to="/auth" className="inline-block bg-gold text-gold-foreground px-4 py-2 rounded-lg font-semibold">Giriş yap</Link>
        </div>
      </div>
    );
  }

  async function deleteListing(id: string) {
    if (!confirm("İlanı silmek istediğine emin misin?")) return;
    setBusy(true);
    const { error } = await supabase.from("stok_listings").delete().eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Silindi");
    void load();
  }

  return (
    <div className="min-h-dvh bg-background text-foreground pb-24">
      <AppHeader />
      <div className="max-w-2xl mx-auto px-4 pt-3">
        <Link to="/account" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
          <ChevronLeft className="size-3.5" /> Hesabım
        </Link>
        <h1 className="font-display text-2xl mt-2 flex items-center gap-2">
          <Package className="size-6 text-gold" /> Taşıtsan Stok Borsası
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Depodaki fazla / atıl / tasfiye stoğunu toplu olarak satışa çıkar; alıcılar teklif versin.
        </p>

        <div className="mt-4 flex gap-1 border-b border-border overflow-x-auto">
          {([
            ["mine", `İlanlarım${listings.length ? ` (${listings.length})` : ""}`],
            ["create", "İlan Oluştur"],
            ["offers", "Gelen Teklifler"],
          ] as [typeof tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => openTab(t)}
              className={`shrink-0 px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
                tab === t ? "border-gold text-gold" : "border-transparent text-muted-foreground"
              }`}>{label}</button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {tab === "create" && (
            <CreateForm userId={user.id} onCreated={() => { openTab("mine"); void load(); }} />
          )}

          {tab === "mine" && (
            listings.length === 0 ? (
              <EmptyState onCreate={() => openTab("create")} />
            ) : listings.map((l) => (
              <ListingCard key={l.id} listing={l} offerCount={offers[l.id]?.length ?? 0}
                onDelete={() => deleteListing(l.id)} busy={busy} />
            ))
          )}

          {tab === "offers" && (
            <OffersList listings={listings} offers={offers} />
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function FullLoader() {
  return <div className="min-h-dvh grid place-items-center"><Loader2 className="size-6 animate-spin text-gold" /></div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-10 border border-dashed border-border rounded-xl">
      <Package className="size-10 mx-auto text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">Henüz ilanın yok.</p>
      <button onClick={onCreate} className="mt-3 inline-flex items-center gap-1.5 bg-gold text-gold-foreground px-4 py-2 rounded-lg text-sm font-semibold">
        <Plus className="size-4" /> İlan oluştur
      </button>
    </div>
  );
}

function ListingCard({ listing, offerCount, onDelete, busy }: { listing: Listing; offerCount: number; onDelete: () => void; busy: boolean }) {
  const s = STATUS_LABEL[listing.status] ?? STATUS_LABEL.draft;
  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{listing.title}</p>
          <p className="text-[11px] text-muted-foreground">{listing.city ?? "—"} · {new Date(listing.created_at).toLocaleDateString("tr-TR")}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Tahmini parça" value={listing.estimated_item_count?.toLocaleString("tr-TR") ?? "—"} />
        <Stat label="OEM sayısı" value={listing.estimated_oem_count?.toLocaleString("tr-TR") ?? "—"} />
        <Stat label="Bek. fiyat" value={listing.expected_price ? `₺${Number(listing.expected_price).toLocaleString("tr-TR")}` : "—"} />
      </div>
      {listing.expert_requested && (
        <p className="text-[11px] text-sky-400">🔍 Ekspertiz talep edildi</p>
      )}
      {listing.admin_note && (
        <p className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1">Admin notu: {listing.admin_note}</p>
      )}
      {(listing.files?.length || listing.images?.length) ? (
        <p className="text-[11px] text-muted-foreground">
          📎 {listing.files?.length ?? 0} dosya · 🖼️ {listing.images?.length ?? 0} görsel
        </p>
      ) : null}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-gold font-semibold">{offerCount} teklif</span>
        <button onClick={onDelete} disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 px-2 py-1 disabled:opacity-50">
          <Trash2 className="size-3.5" /> Sil
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 rounded-lg p-2 text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-bold">{value}</p>
    </div>
  );
}

function OffersList({ listings, offers }: { listings: Listing[]; offers: Record<string, Offer[]> }) {
  const all = listings.flatMap((l) => (offers[l.id] ?? []).map((o) => ({ ...o, title: l.title })));
  if (all.length === 0) return <p className="text-sm text-muted-foreground p-6 text-center">Henüz teklif yok.</p>;
  return (
    <div className="space-y-2">
      {all.map((o) => (
        <div key={o.id} className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm truncate">{o.title}</p>
            <span className="text-gold font-bold">₺{Number(o.offer_amount).toLocaleString("tr-TR")}</span>
          </div>
          {o.note && <p className="text-[11px] text-muted-foreground mt-1">{o.note}</p>}
          <p className="text-[10px] text-muted-foreground mt-1">{new Date(o.created_at).toLocaleString("tr-TR")}</p>
        </div>
      ))}
    </div>
  );
}

function CreateForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [items, setItems] = useState("");
  const [oems, setOems] = useState("");
  const [price, setPrice] = useState("");
  const [expert, setExpert] = useState(false);
  const [files, setFiles] = useState<{ name: string; path: string; type: string }[]>([]);
  const [images, setImages] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name} 20MB'tan büyük`); continue; }
        const safe = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
        const { error } = await supabase.storage.from("stok-uploads").upload(path, f, { upsert: false });
        if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
        const isImg = /^image\//.test(f.type);
        if (isImg) setImages((p) => [...p, { name: f.name, path }]);
        else setFiles((p) => [...p, { name: f.name, path, type: f.type || "application/octet-stream" }]);
      }
      toast.success("Yükleme tamam");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) { toast.error("Başlık en az 3 karakter"); return; }
    setSaving(true);
    const { error } = await supabase.from("stok_listings").insert({
      seller_id: userId,
      title: title.trim(),
      description: description.trim() || null,
      city: city.trim() || null,
      estimated_item_count: items ? Number(items) : null,
      estimated_oem_count: oems ? Number(oems) : null,
      expected_price: price ? Number(price) : null,
      expert_requested: expert,
      files,
      images,
      status: "pending_review",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("İlan oluşturuldu — admin incelemesinde");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-3 space-y-3">
      <Field label="Başlık *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Örn: 1500 kalem Renault yan sanayi tasfiye" />
      </Field>
      <Field label="Açıklama">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="Stoğun durumu, marka karması, satış koşulları..." />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Şehir">
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={60}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </Field>
        <Field label="Beklenen fiyat (₺)">
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </Field>
        <Field label="Tahmini parça adedi">
          <input value={items} onChange={(e) => setItems(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </Field>
        <Field label="Tahmini OEM sayısı">
          <input value={oems} onChange={(e) => setOems(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} className="size-4" />
        🔍 Ekspertiz / değerleme talep ediyorum
      </label>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase text-gold tracking-wider">Dosya ve görseller</p>
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-gold transition">
          <Upload className="size-4 text-gold" />
          <span className="text-sm">{uploading ? "Yükleniyor..." : "Excel / PDF / Görsel yükle (maks 20MB)"}</span>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden"
            onChange={(e) => uploadFiles(e.target.files)} disabled={uploading} />
        </label>
        {(files.length > 0 || images.length > 0) && (
          <ul className="text-[11px] space-y-1">
            {files.map((f, i) => (
              <li key={`f${i}`} className="flex items-center gap-2 text-muted-foreground">
                <FileText className="size-3" /> {f.name}
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="ml-auto text-rose-400">×</button>
              </li>
            ))}
            {images.map((f, i) => (
              <li key={`i${i}`} className="flex items-center gap-2 text-muted-foreground">
                <ImageIcon className="size-3" /> {f.name}
                <button type="button" onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="ml-auto text-rose-400">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" disabled={saving || uploading}
        className="w-full bg-gold text-gold-foreground py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60">
        {saving ? "Gönderiliyor..." : "İlanı yayına gönder"}
      </button>
      <p className="text-[10px] text-muted-foreground text-center">İlan admin incelemesinden sonra yayına alınır.</p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      {children}
    </label>
  );
}
