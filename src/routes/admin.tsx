import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft, Phone, Mail, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Yönetici Paneli — Taşıtsan" }] }),
  component: AdminPage,
});

type Status = "new" | "in_progress" | "resolved";

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

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    const { data: inquiries, error } = await supabase
      .from("inquiries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }

    const partIds = Array.from(new Set((inquiries ?? []).map((i) => i.part_id)));
    const buyerIds = Array.from(new Set((inquiries ?? []).map((i) => i.buyer_id).filter(Boolean) as string[]));

    const [partsRes, buyersRes] = await Promise.all([
      partIds.length
        ? supabase.from("parts").select("id,title,brand,model,whatsapp,city,seller_id").in("id", partIds)
        : Promise.resolve({ data: [] as any[] }),
      buyerIds.length
        ? supabase.from("profiles").select("id,display_name").in("id", buyerIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sellerIds = Array.from(new Set((partsRes.data ?? []).map((p: any) => p.seller_id)));
    const sellersRes = sellerIds.length
      ? await supabase.from("profiles").select("id,display_name,whatsapp").in("id", sellerIds)
      : { data: [] as any[] };

    const partsMap = new Map((partsRes.data ?? []).map((p: any) => [p.id, p]));
    const buyersMap = new Map((buyersRes.data ?? []).map((p: any) => [p.id, p]));
    const sellersMap = new Map((sellersRes.data ?? []).map((p: any) => [p.id, p]));

    setItems((inquiries ?? []).map((i: any) => {
      const part = partsMap.get(i.part_id);
      return {
        ...i,
        part: part ?? null,
        buyer: i.buyer_id ? buyersMap.get(i.buyer_id) ?? null : null,
        seller: part ? sellersMap.get(part.seller_id) ?? null : null,
      };
    }));
    setLoading(false);
  };

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("inquiries").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    toast.success("Durum güncellendi");
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

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="size-9 rounded-full bg-card grid place-items-center"><ArrowLeft className="size-4" /></Link>
          <div>
            <h1 className="font-display text-lg tracking-wide">Yönetici Paneli</h1>
            <p className="text-[11px] text-muted-foreground">Tüm talepler — {items.length} kayıt</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {(["all", "new", "in_progress", "resolved"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
              }`}>
              {s === "all" ? "Tümü" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">Talep yok.</p>
        ) : filtered.map((i) => (
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
              {i.company && <Field label="Firma" value={i.company} icon={<Building2 className="size-3" />} />}
              <Field label="Tarih" value={new Date(i.created_at).toLocaleString("tr-TR")} icon={<Calendar className="size-3" />} />
            </div>

            <div className="bg-background/50 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {i.message}
            </div>

            {i.part && (
              <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-[11px] space-y-1">
                <p className="text-gold font-semibold uppercase tracking-wider">Satıcı bilgileri (sadece admin)</p>
                <p>{i.seller?.display_name ?? "—"} · {i.seller?.whatsapp ?? i.part.whatsapp}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {(["new", "in_progress", "resolved"] as Status[]).map((s) => (
                <Button key={s} type="button" variant={i.status === s ? "default" : "outline"}
                  onClick={() => updateStatus(i.id, s)}
                  className={`flex-1 h-9 text-xs ${i.status === s ? "bg-gold-gradient text-gold-foreground hover:opacity-90" : ""}`}>
                  {STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </main>
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
