import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Eye, FileText, Image as ImageIcon, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  city: string | null;
  estimated_item_count: number | null;
  estimated_oem_count: number | null;
  expected_price: number | null;
  status: string;
  expert_requested: boolean;
  files: { name: string; path: string }[];
  images: { name: string; path: string }[];
  admin_note: string | null;
  created_at: string;
};

type Offer = {
  id: string;
  listing_id: string;
  buyer_id: string;
  offer_amount: number;
  note: string | null;
  created_at: string;
};

const STATUS_OPTS: { value: Listing["status"]; label: string }[] = [
  { value: "pending_review", label: "Bekleyen" },
  { value: "active", label: "Aktif" },
  { value: "offer_collecting", label: "Teklif" },
  { value: "sold", label: "Satıldı" },
  { value: "cancelled", label: "İptal" },
];

export function StokBorsasiPanel() {
  const [tab, setTab] = useState<"pending_review" | "active" | "offers" | "expert">("pending_review");
  const [rows, setRows] = useState<Listing[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      if (tab === "offers") {
        const { data, error } = await supabase
          .from("stok_offers").select("*").order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        setOffers((data ?? []) as Offer[]);
        const ids = Array.from(new Set((data ?? []).map((o) => o.listing_id)));
        if (ids.length) {
          const { data: ls } = await supabase.from("stok_listings").select("*").in("id", ids);
          setRows((ls ?? []) as unknown as Listing[]);
        } else setRows([]);
      } else {
        let q = supabase.from("stok_listings").select("*").order("created_at", { ascending: false }).limit(100);
        if (tab === "expert") q = q.eq("expert_requested", true);
        else if (tab === "active") q = q.in("status", ["active", "offer_collecting"]);
        else q = q.eq("status", "pending_review");
        const { data, error } = await q;
        if (error) throw error;
        setRows((data ?? []) as unknown as Listing[]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tab]);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    const { error } = await supabase.from("stok_listings").update({ status: status as "pending_review" | "active" | "offer_collecting" | "sold" | "cancelled" | "draft" }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Güncellendi");
    void load();
  }

  async function setAdminNote(id: string) {
    const note = prompt("Admin notu (kullanıcıya görünür):");
    if (note === null) return;
    setBusyId(id);
    const { error } = await supabase.from("stok_listings").update({ admin_note: note || null }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    void load();
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("stok-uploads").createSignedUrl(path, 60 * 10);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {([
          ["pending_review", "Bekleyen"],
          ["active", "Aktif"],
          ["offers", "Teklifler"],
          ["expert", "🔍 Ekspertiz"],
        ] as [typeof tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${
              tab === t ? "border-gold text-gold" : "border-transparent text-muted-foreground"
            }`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground p-4 flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Yükleniyor...</p>
      ) : tab === "offers" ? (
        offers.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {offers.map((o) => {
              const l = rows.find((r) => r.id === o.listing_id);
              return (
                <div key={o.id} className="bg-card border border-border rounded-xl p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold truncate">{l?.title ?? o.listing_id.slice(0, 8)}</p>
                    <span className="text-gold font-bold">₺{Number(o.offer_amount).toLocaleString("tr-TR")}</span>
                  </div>
                  {o.note && <p className="text-muted-foreground mt-1">{o.note}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Alıcı: {o.buyer_id.slice(0, 8)} · {new Date(o.created_at).toLocaleString("tr-TR")}
                  </p>
                </div>
              );
            })}
          </div>
        )
      ) : rows.length === 0 ? <Empty /> : (
        <div className="space-y-2">
          {rows.map((l) => (
            <div key={l.id} className="bg-card border border-border rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{l.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.city ?? "—"} · {new Date(l.created_at).toLocaleDateString("tr-TR")} · Satıcı: {l.seller_id.slice(0, 8)}
                  </p>
                </div>
                {l.expert_requested && <span className="text-[10px] text-sky-400 border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 rounded-full">🔍 Ekspertiz</span>}
              </div>
              {l.description && <p className="text-[11px] text-muted-foreground line-clamp-3">{l.description}</p>}
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <Stat label="Parça" value={l.estimated_item_count?.toLocaleString("tr-TR") ?? "—"} />
                <Stat label="OEM" value={l.estimated_oem_count?.toLocaleString("tr-TR") ?? "—"} />
                <Stat label="Bek. ₺" value={l.expected_price ? Number(l.expected_price).toLocaleString("tr-TR") : "—"} />
              </div>
              {((l.files?.length ?? 0) + (l.images?.length ?? 0)) > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(l.files ?? []).map((f, i) => (
                    <button key={`f${i}`} onClick={() => openFile(f.path)}
                      className="inline-flex items-center gap-1 text-[10px] bg-background/60 border border-border rounded px-2 py-1 hover:border-gold">
                      <FileText className="size-3" /> {f.name}
                    </button>
                  ))}
                  {(l.images ?? []).map((f, i) => (
                    <button key={`i${i}`} onClick={() => openFile(f.path)}
                      className="inline-flex items-center gap-1 text-[10px] bg-background/60 border border-border rounded px-2 py-1 hover:border-gold">
                      <ImageIcon className="size-3" /> {f.name}
                    </button>
                  ))}
                </div>
              )}
              {l.admin_note && (
                <p className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1">
                  Not: {l.admin_note}
                </p>
              )}
              <div className="flex flex-wrap gap-1 pt-1">
                <select
                  value={l.status}
                  onChange={(e) => updateStatus(l.id, e.target.value)}
                  disabled={busyId === l.id}
                  className="bg-background border border-border rounded px-2 py-1 text-[11px]"
                >
                  {STATUS_OPTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button onClick={() => updateStatus(l.id, "active")} disabled={busyId === l.id}
                  className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1">
                  <CheckCircle2 className="size-3" /> Onayla
                </button>
                <button onClick={() => updateStatus(l.id, "cancelled")} disabled={busyId === l.id}
                  className="inline-flex items-center gap-1 text-[11px] bg-rose-500/15 text-rose-300 border border-rose-500/40 rounded px-2 py-1">
                  <XCircle className="size-3" /> Reddet
                </button>
                <button onClick={() => setAdminNote(l.id)} disabled={busyId === l.id}
                  className="inline-flex items-center gap-1 text-[11px] bg-background border border-border rounded px-2 py-1">
                  <Eye className="size-3" /> Not
                </button>
                {l.expert_requested && (
                  <button onClick={async () => {
                    setBusyId(l.id);
                    const { error } = await supabase.from("stok_listings")
                      .update({ expert_completed: true, status: "active" as const }).eq("id", l.id);
                    setBusyId(null);
                    if (error) { toast.error(error.message); return; }
                    toast.success("Ekspertiz tamamlandı");
                    void load();
                  }}
                    className="inline-flex items-center gap-1 text-[11px] bg-sky-500/15 text-sky-300 border border-sky-500/40 rounded px-2 py-1">
                    <Search className="size-3" /> Ekspertiz tamam
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 rounded p-1.5 text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className="text-[11px] font-bold">{value}</p>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground p-6 text-center">Kayıt yok.</p>;
}
