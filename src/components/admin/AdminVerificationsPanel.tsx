import { translateError } from "@/lib/error-messages";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X as XIcon, BadgeCheck, ShieldOff, Calendar, MapPin, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";

interface Row {
  id: string;
  user_id: string;
  account_type: "individual" | "business";
  company_name: string | null;
  tax_number: string | null;
  contact_person: string | null;
  city: string | null;
  phone: string | null;
  notes: string | null;
  admin_notes: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
    is_verified: boolean;
  } | null;
  parts_count?: number;
}

const STATUS_LABEL = { pending: "Beklemede", approved: "Onaylandı", rejected: "Reddedildi" } as const;
const STATUS_CLS: Record<Row["status"], string> = {
  pending: "bg-amber-400/15 text-amber-300 border-amber-400/40",
  approved: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  rejected: "bg-destructive/15 text-destructive border-destructive/40",
};

export function AdminVerificationsPanel({ currentUserId }: { currentUserId: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("seller_verifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data ?? []) as Row[];
    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    const [profsRes, partsRes] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id,display_name,avatar_url,email,is_verified").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase.from("parts").select("seller_id").in("seller_id", userIds).eq("status", "approved")
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profMap = new Map(((profsRes.data ?? []) as any[]).map((p) => [p.id, p]));
    const countMap = new Map<string, number>();
    ((partsRes.data ?? []) as any[]).forEach((p) => {
      countMap.set(p.seller_id, (countMap.get(p.seller_id) ?? 0) + 1);
    });
    setRows(list.map((r) => ({
      ...r,
      profile: profMap.get(r.user_id) ?? null,
      parts_count: countMap.get(r.user_id) ?? 0,
    })));
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const update = async (
    id: string,
    patch: { status?: Row["status"]; admin_notes?: string | null },
  ) => {
    const { error } = await supabase
      .from("seller_verifications")
      .update({ ...patch, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Güncellendi");
    void load();
  };

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const counts = {
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["pending", "approved", "rejected", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === s ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
            }`}
          >
            {s === "all" ? `Tümü (${rows.length})` : `${STATUS_LABEL[s]} (${counts[s]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
      ) : filtered.map((r) => (
        <article key={r.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <UserAvatar url={r.profile?.avatar_url ?? null} name={r.profile?.display_name ?? null} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm truncate">{r.profile?.display_name ?? "—"}</p>
                {r.profile?.is_verified && <BadgeCheck className="size-3.5 text-sky-400 shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{r.profile?.email ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-0.5"><Calendar className="size-3" />{new Date(r.created_at).toLocaleDateString("tr-TR")}</span>
                <span>· {r.parts_count} aktif ilan</span>
                <span>· {r.account_type === "business" ? "Kurumsal" : "Bireysel"}</span>
              </p>
            </div>
            <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${STATUS_CLS[r.status]}`}>
              {STATUS_LABEL[r.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {r.company_name && <div><span className="text-muted-foreground">Firma:</span> {r.company_name}</div>}
            {r.tax_number && <div><span className="text-muted-foreground">VKN:</span> {r.tax_number}</div>}
            {r.contact_person && <div><span className="text-muted-foreground">Yetkili:</span> {r.contact_person}</div>}
            {r.city && <div className="inline-flex items-center gap-1"><MapPin className="size-3" />{r.city}</div>}
            {r.phone && <div className="inline-flex items-center gap-1"><Phone className="size-3" />{r.phone}</div>}
          </div>

          {r.notes && (
            <div className="bg-background/50 rounded-lg p-2.5 text-[11px] leading-relaxed">{r.notes}</div>
          )}

          {noteFor === r.id ? (
            <div className="space-y-2">
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                placeholder="Açıklama (satıcıya iletilir)" rows={2} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setNoteFor(null)} className="flex-1 h-8 text-xs">İptal</Button>
                <Button size="sm" onClick={() => { void update(r.id, { admin_notes: noteText, status: "rejected" }); setNoteFor(null); }}
                  className="flex-1 h-8 text-xs bg-destructive/90 hover:bg-destructive text-white">Reddet</Button>
              </div>
            </div>
          ) : (
            <>
              {r.admin_notes && r.status === "rejected" && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-[11px]">
                  <span className="font-semibold text-destructive">Açıklama: </span>{r.admin_notes}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" onClick={() => void update(r.id, { status: "approved", admin_notes: null })}
                  disabled={r.status === "approved"}
                  className="h-9 text-xs bg-sky-500/90 hover:bg-sky-500 text-white">
                  <Check className="size-3.5 mr-1" /> Onayla
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { setNoteFor(r.id); setNoteText(r.admin_notes ?? ""); }}
                  disabled={r.status === "rejected"}
                  className="h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
                  <XIcon className="size-3.5 mr-1" /> Reddet
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => void update(r.id, { status: "pending" })}
                  disabled={r.status !== "approved"}
                  className="h-9 text-xs">
                  <ShieldOff className="size-3.5 mr-1" /> Rozeti Kaldır
                </Button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
