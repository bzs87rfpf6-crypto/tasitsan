import { translateError } from "@/lib/error-messages";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  ShieldCheck,
  Crown,
  Star,
  Ban,
  RotateCcw,
  X as XIcon,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Building2,
  FileText,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { VerificationBadgeList } from "@/components/trust/VerificationBadgePill";
import {
  SELLER_BADGE_KEYS,
  USER_BADGE_KEYS,
  VERIFICATION_BADGES,
  type VerificationBadgeKey,
} from "@/lib/verification-badges";

type Filter = "pending" | "verified_users" | "verified_sellers" | "rejected" | "suspended";

interface Row {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  company_name: string | null;
  city: string | null;
  verified_phone: string | null;
  phone_verified_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  verification_status: string;
  user_verified: boolean;
  seller_verified: boolean;
  user_badges: string[];
  seller_badges: string[];
  verification_notes: string | null;
  verification_documents: unknown;
  is_admin: boolean;
  is_seller: boolean;
  parts_count: number;
  reviews_count: number;
  trust_score: number | null;
  sv_id: string | null;
  sv_account_type: string | null;
  sv_tax_number: string | null;
  sv_contact_person: string | null;
  sv_phone: string | null;
  sv_notes: string | null;
}

type Counts = Record<Filter, number>;

const TABS: { key: Filter; label: string; emoji: string }[] = [
  { key: "pending", label: "Bekleyen", emoji: "⏳" },
  { key: "verified_users", label: "Doğrulanmış Kullanıcı", emoji: "✔" },
  { key: "verified_sellers", label: "Doğrulanmış Satıcı", emoji: "🛡" },
  { key: "rejected", label: "Reddedilen", emoji: "❌" },
  { key: "suspended", label: "Askıda", emoji: "⛔" },
];

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function roleLabel(row: Row): { label: string; cls: string } {
  if (row.is_admin) return { label: "👑 Admin", cls: "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10" };
  if (row.seller_verified || row.is_seller) return { label: "🛡 Satıcı", cls: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10" };
  return { label: "👤 Kullanıcı", cls: "text-sky-300 border-sky-400/40 bg-sky-400/10" };
}

function statusPill(status: string): { label: string; cls: string } {
  switch (status) {
    case "verified": return { label: "Doğrulandı", cls: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10" };
    case "pending":  return { label: "Beklemede",  cls: "text-amber-300 border-amber-400/40 bg-amber-400/10" };
    case "rejected": return { label: "Reddedildi", cls: "text-destructive border-destructive/40 bg-destructive/10" };
    case "suspended":return { label: "Askıda",     cls: "text-orange-300 border-orange-400/40 bg-orange-400/10" };
    default:         return { label: "Doğrulanmamış", cls: "text-muted-foreground border-border bg-background/40" };
  }
}

export function TrustCenterPanel() {
  const [tab, setTab] = useState<Filter>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, verified_users: 0, verified_sellers: 0, rejected: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const loadCounts = async () => {
    try {
      const { data, error } = await supabase.rpc("trust_counts");
      if (error) {
        console.error("[TrustCenter] trust_counts error:", error);
        return;
      }
      if (data) setCounts(data as unknown as Counts);
    } catch (e) {
      console.error("[TrustCenter] trust_counts threw:", e);
    }
  };

  const load = async (filter: Filter) => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("trust_list_users", { _filter: filter });
      if (error) {
        console.error("[TrustCenter] trust_list_users error:", { filter, error });
        setLoadError(error.message || "Liste yüklenemedi");
        setRows([]);
        return;
      }
      setRows((data ?? []) as Row[]);
    } catch (e: any) {
      console.error("[TrustCenter] trust_list_users threw:", e);
      setLoadError(e?.message ?? "Beklenmeyen hata");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCounts(); }, []);
  useEffect(() => { void load(tab); }, [tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.display_name, r.email, r.company_name, r.verified_phone, r.sv_phone, r.city]
        .filter(Boolean).some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [rows, query]);

  const apply = async (
    userId: string,
    action: "verify_user" | "verify_seller" | "grant_badge" | "revoke_badge" | "suspend" | "unsuspend" | "reject" | "reset",
    opts: { badge?: VerificationBadgeKey; notes?: string } = {},
  ) => {
    const { error } = await supabase.rpc("trust_apply_action", {
      _user_id: userId,
      _action: action,
      _badge: opts.badge ?? undefined,
      _notes: opts.notes ?? undefined,
    });
    if (error) { toast.error(translateError(error)); return; }
    toast.success("Güncellendi");
    await Promise.all([load(tab), loadCounts()]);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-background to-background p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="size-5 text-gold" />
          <h2 className="text-base font-bold text-gold">Güven Merkezi</h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Kullanıcı ve satıcı doğrulamalarını, rozetleri ve askıya alma işlemlerini buradan yönetin.
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              tab === t.key
                ? "bg-gold-gradient text-gold-foreground border-transparent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <span aria-hidden className="mr-1">{t.emoji}</span>
            {t.label} <span className="opacity-70">({counts[t.key] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara: isim, firma, e-posta, telefon..." className="pl-9 h-9 text-sm" />
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-8">Yükleniyor...</p>
      ) : loadError ? (
        <div className="text-center py-8 space-y-2">
          <p className="text-sm text-destructive">Liste yüklenemedi</p>
          <p className="text-[11px] text-muted-foreground font-mono break-all px-4">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load(tab)} className="h-8 text-xs">Tekrar dene</Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">Kayıt yok.</p>
      ) : filtered.map((r) => {
        const role = roleLabel(r);
        const status = statusPill(r.verification_status);
        const isOpen = openId === r.id;
        return (
          <article key={r.id} className="bg-card rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : r.id)}
              className="w-full text-left p-4 flex items-start gap-3 hover:bg-background/40 transition"
            >
              <UserAvatar url={r.avatar_url} name={r.display_name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold text-sm truncate">{r.display_name ?? "—"}</p>
                  {r.user_verified && <BadgeCheck className="size-3.5 text-sky-400 shrink-0" />}
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${role.cls}`}>{role.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{r.company_name ?? r.email ?? "—"}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5"><Calendar className="size-3" />{fmtDate(r.created_at)}</span>
                  <span>· {r.parts_count} ilan</span>
                  <span>· {r.reviews_count} yorum</span>
                  {r.trust_score != null && <span>· ⭐ {Number(r.trust_score).toFixed(0)}</span>}
                </div>
                <div className="mt-1.5">
                  <VerificationBadgeList badges={[...r.seller_badges, ...r.user_badges]} />
                </div>
              </div>
              <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${status.cls}`}>
                {status.label}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-border p-4 space-y-3 bg-background/30">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                  {r.email && <div className="inline-flex items-center gap-1 min-w-0"><Mail className="size-3 shrink-0" /><span className="truncate">{r.email}</span></div>}
                  {(r.verified_phone || r.sv_phone) && (
                    <div className="inline-flex items-center gap-1">
                      <Phone className="size-3" />
                      {r.verified_phone ?? r.sv_phone}
                      {r.phone_verified_at && <BadgeCheck className="size-3 text-sky-400" />}
                    </div>
                  )}
                  {r.city && <div className="inline-flex items-center gap-1"><MapPin className="size-3" />{r.city}</div>}
                  {r.company_name && <div className="inline-flex items-center gap-1 min-w-0"><Building2 className="size-3 shrink-0" /><span className="truncate">{r.company_name}</span></div>}
                  {r.sv_tax_number && <div><span className="text-muted-foreground">VKN:</span> {r.sv_tax_number}</div>}
                  {r.sv_contact_person && <div><span className="text-muted-foreground">Yetkili:</span> {r.sv_contact_person}</div>}
                  <div><span className="text-muted-foreground">Son giriş:</span> {fmtDate(r.last_sign_in_at)}</div>
                  {r.sv_account_type && <div><span className="text-muted-foreground">Tip:</span> {r.sv_account_type === "business" ? "Kurumsal" : "Bireysel"}</div>}
                </div>

                {(r.sv_notes || r.verification_notes) && (
                  <div className="rounded-lg bg-background/60 border border-border p-2.5 text-[11px] leading-relaxed space-y-1">
                    {r.sv_notes && <div><span className="text-muted-foreground">Satıcı notu:</span> {r.sv_notes}</div>}
                    {r.verification_notes && <div><span className="text-muted-foreground">Admin notu:</span> {r.verification_notes}</div>}
                  </div>
                )}

                <div className="rounded-lg border border-border/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 inline-flex items-center gap-1">
                    <FileText className="size-3" /> Belgeler
                  </p>
                  <ul className="text-[11px] space-y-0.5">
                    <li>{r.phone_verified_at ? "✅" : "⚪"} Telefon doğrulaması</li>
                    <li>{r.email ? "✅" : "⚪"} E-posta</li>
                    <li>{r.sv_tax_number ? "✅" : "⚪"} Vergi Levhası (VKN)</li>
                    <li>{r.sv_contact_person ? "✅" : "⚪"} Yetkili bilgisi</li>
                  </ul>
                </div>

                {rejectFor === r.id ? (
                  <div className="space-y-2">
                    <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Ret açıklaması (kullanıcıya görünür)" rows={2} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRejectFor(null)} className="flex-1 h-8 text-xs">İptal</Button>
                      <Button size="sm" className="flex-1 h-8 text-xs bg-destructive/90 hover:bg-destructive text-white"
                        onClick={() => { void apply(r.id, "reject", { notes: noteText }); setRejectFor(null); }}>
                        Reddet
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={() => void apply(r.id, "verify_user")}
                        className="h-9 text-xs bg-sky-500/90 hover:bg-sky-500 text-white">
                        <BadgeCheck className="size-3.5 mr-1" /> Kullanıcıyı Doğrula
                      </Button>
                      <Button size="sm" onClick={() => void apply(r.id, "verify_seller")}
                        className="h-9 text-xs bg-emerald-500/90 hover:bg-emerald-500 text-white">
                        <ShieldCheck className="size-3.5 mr-1" /> Satıcı Olarak Doğrula
                      </Button>
                      <Button size="sm" onClick={() => void apply(r.id, "grant_badge", { badge: "premium_seller" })}
                        className="h-9 text-xs bg-gold-gradient text-gold-foreground">
                        <Crown className="size-3.5 mr-1" /> Premium
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void apply(r.id, "grant_badge", { badge: "trusted_seller" })}
                        className="h-9 text-xs border-amber-400/40 text-amber-300 hover:bg-amber-400/10">
                        <Star className="size-3.5 mr-1" /> Güvenilir Rozeti
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void apply(r.id, "grant_badge", { badge: "elite_seller" })}
                        className="h-9 text-xs border-fuchsia-400/40 text-fuchsia-300 hover:bg-fuchsia-400/10">
                        👑 Elit Yap
                      </Button>
                      {r.verification_status === "suspended" ? (
                        <Button size="sm" variant="outline" onClick={() => void apply(r.id, "unsuspend")}
                          className="h-9 text-xs">
                          <RotateCcw className="size-3.5 mr-1" /> Askıyı Kaldır
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => void apply(r.id, "suspend")}
                          className="h-9 text-xs border-orange-400/40 text-orange-300 hover:bg-orange-400/10">
                          <Ban className="size-3.5 mr-1" /> Askıya Al
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline"
                        onClick={() => { setRejectFor(r.id); setNoteText(r.verification_notes ?? ""); }}
                        className="h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
                        <XIcon className="size-3.5 mr-1" /> Reddet
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void apply(r.id, "reset")}
                        className="h-9 text-xs">
                        Doğrulamayı Kaldır
                      </Button>
                    </div>

                    {(r.seller_badges.length > 0 || r.user_badges.length > 0) && (
                      <div className="pt-2 border-t border-border/60">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Rozetler</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[...r.seller_badges, ...r.user_badges].map((b) => {
                            const meta = VERIFICATION_BADGES[b as VerificationBadgeKey];
                            if (!meta) return null;
                            return (
                              <button key={b}
                                onClick={() => void apply(r.id, "revoke_badge", { badge: b as VerificationBadgeKey })}
                                title="Rozeti kaldır"
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${meta.className} hover:opacity-70`}>
                                <span>{meta.emoji}</span>{meta.short}
                                <XIcon className="size-2.5 opacity-70" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/60">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Rozet ver</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...USER_BADGE_KEYS, ...SELLER_BADGE_KEYS]
                          .filter((k) => ![...r.user_badges, ...r.seller_badges].includes(k))
                          .map((k) => {
                            const meta = VERIFICATION_BADGES[k];
                            return (
                              <button key={k}
                                onClick={() => void apply(r.id, "grant_badge", { badge: k })}
                                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-gold/40">
                                <span>{meta.emoji}</span>{meta.short}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
