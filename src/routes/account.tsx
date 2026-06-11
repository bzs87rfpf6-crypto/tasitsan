import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LogOut, Package, Pencil, Power, Trash2, Heart, ClipboardList, Bell, Flame, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { SafePartImage } from "@/components/SafePartImage";
import { AvatarUploader } from "@/components/AvatarUploader";
import { SellerVerification } from "@/components/SellerVerification";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userChangePassword } from "@/lib/admin.functions";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Hesabım — Taşıtsan" }] }),
  component: AccountPage,
});

interface MyPart {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  photos: string[] | null;
  status: string;
  stock_quantity: number | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Onay Bekliyor", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  approved: { label: "Yayında", cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  inactive: { label: "Pasif", cls: "text-muted-foreground border-border bg-muted/30" },
  rejected: { label: "Reddedildi", cls: "text-destructive border-destructive/40 bg-destructive/10" },
};

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState({ display_name: "", whatsapp: "", city: "", avatar_url: null as string | null });
  const [myParts, setMyParts] = useState<MyPart[]>([]);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);
  const callChangePassword = useServerFn(userChangePassword);

  const changePassword = async () => {
    if (pw.next.length < 6) { toast.error("Yeni şifre en az 6 karakter olmalı."); return; }
    if (pw.next !== pw.confirm) { toast.error("Yeni şifreler eşleşmiyor."); return; }
    setChangingPw(true);
    try {
      await callChangePassword({ data: { currentPassword: pw.current, newPassword: pw.next } });
      toast.success("Şifreniz güncellendi.");
      setPw({ current: "", next: "", confirm: "" });
    } catch (e: any) {
      toast.error(translateError(e, "Şifre güncellenemedi"));
    } finally {
      setChangingPw(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const loadParts = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("parts")
      .select("id,title,brand,model,price,photos,status,stock_quantity")
      .eq("seller_id", uid)
      .order("created_at", { ascending: false });
    setMyParts((data ?? []) as MyPart[]);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_my_profile").maybeSingle().then(({ data }) => {
      const d = data as any;
      if (d) setProfile({
        display_name: d.display_name ?? "",
        whatsapp: d.whatsapp ?? "",
        city: d.city ?? "",
        avatar_url: d.avatar_url ?? null,
      });
    });
    loadParts(user.id);
  }, [user, loadParts]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { avatar_url: _ignored, ...patch } = profile;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(translateError(error));
    else toast.success("Profil güncellendi");
  };

  const togglePassive = async (p: MyPart) => {
    if (!user) return;
    const next = p.status === "inactive" ? "pending" : "inactive";
    const { error } = await supabase.from("parts").update({ status: next }).eq("id", p.id).eq("seller_id", user.id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success(next === "inactive" ? "İlan pasife alındı" : "İlan tekrar onaya gönderildi");
    loadParts(user.id);
  };

  const deletePart = async (p: MyPart) => {
    if (!user) return;
    if (!confirm(`"${p.title}" ilanını silmek istediğine emin misin?`)) return;
    const { error } = await supabase.from("parts").delete().eq("id", p.id).eq("seller_id", user.id);
    if (error) { toast.error(translateError(error)); return; }
    toast.success("İlan silindi");
    loadParts(user.id);
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader subtitle="Hesabım" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-6">

        <div className="grid grid-cols-3 gap-3">
          <Link to="/favorites" className="flex flex-col items-center justify-center gap-1.5 bg-card border border-border hover:border-gold rounded-xl p-4 transition">
            <span className="size-9 rounded-full bg-destructive/10 grid place-items-center">
              <Heart className="size-4 text-destructive fill-destructive" />
            </span>
            <span className="text-xs font-semibold">Favorilerim</span>
          </Link>
          <Link to="/my-requests" className="flex flex-col items-center justify-center gap-1.5 bg-card border border-border hover:border-gold rounded-xl p-4 transition">
            <span className="size-9 rounded-full bg-gold/10 grid place-items-center">
              <ClipboardList className="size-4 text-gold" />
            </span>
            <span className="text-xs font-semibold">Taleplerim</span>
          </Link>
          <Link to="/alerts" className="flex flex-col items-center justify-center gap-1.5 bg-card border border-border hover:border-gold rounded-xl p-4 transition">
            <span className="size-9 rounded-full bg-sky-400/10 grid place-items-center">
              <Bell className="size-4 text-sky-400" />
            </span>
            <span className="text-xs font-semibold text-center leading-tight">Parça Alarmlarım</span>
          </Link>
        </div>

        <Link
          to="/insights"
          className="block bg-gradient-to-br from-gold/20 via-gold/5 to-background border-2 border-gold/50 rounded-2xl p-4 shadow-gold hover:shadow-gold/60 transition"
        >
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-xl bg-gold-gradient grid place-items-center shrink-0 shadow-gold">
              <Flame className="size-5 text-gold-foreground" strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base text-gold leading-tight">Hazır Müşteri Fırsatları</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                İlanlarınızı arayan ve bekleyen alıcıları görün.
              </p>
            </div>
            <span className="text-gold font-bold text-lg shrink-0">→</span>
          </div>
        </Link>


        <section className="bg-card border border-border rounded-xl p-4 space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Profil Fotoğrafı</h2>
          {user && (
            <AvatarUploader
              userId={user.id}
              displayName={profile.display_name}
              avatarUrl={profile.avatar_url}
              onChange={(url) => setProfile((p) => ({ ...p, avatar_url: url }))}
            />
          )}
          {user && (
            <Link to="/u/$id" params={{ id: user.id }} className="block text-[11px] text-gold font-semibold">
              Herkese açık profilimi görüntüle →
            </Link>
          )}
        </section>

        <section className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Profil Bilgileri</h2>
          <Input placeholder="Ad / İşletme" value={profile.display_name}
            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} className="h-11 bg-background" />
          <Input placeholder="WhatsApp" value={profile.whatsapp}
            onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} className="h-11 bg-background" />
          <Input placeholder="Şehir" value={profile.city}
            onChange={(e) => setProfile({ ...profile, city: e.target.value })} className="h-11 bg-background" />
          <Button onClick={save} disabled={saving} className="w-full bg-gold-gradient text-gold-foreground font-semibold">
            {saving ? "..." : "Kaydet"}
          </Button>
        </section>

        <section className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-sky-400 font-semibold">Doğrulanmış Satıcı Başvurusu</h2>
          <SellerVerification userId={user.id} />
        </section>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold">Bildirimler</h2>
          <PushNotificationToggle />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
              <Package className="size-4" /> İlanlarım ({myParts.length})
            </h2>
            <Link to="/sell" className="text-xs text-gold font-semibold">+ Yeni</Link>
          </div>
          {myParts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Henüz ilanın yok.</p>
          ) : (
            <ul className="space-y-3">
              {myParts.map((p) => {
                const status = STATUS_LABEL[p.status] ?? { label: p.status, cls: "text-muted-foreground border-border" };
                return (
                  <li key={p.id} className="bg-card border border-border rounded-xl p-3 flex gap-3">
                    <Link to="/parts/$id" params={{ id: p.id }} className="size-20 shrink-0 rounded-lg overflow-hidden bg-secondary block">
                      <SafePartImage images={p.photos} alt={p.title} width={160} className="w-full h-full object-cover" />
                    </Link>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-tight line-clamp-2">{p.title}</h3>
                        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>
                      {(p.brand || p.model) && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {[p.brand, p.model].filter(Boolean).join(" • ")}
                        </p>
                      )}
                      <div className="text-gold font-bold text-sm font-display tracking-wider">
                        {p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Link to="/parts/$id/edit" params={{ id: p.id }}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold bg-gold-gradient text-gold-foreground">
                          <Pencil className="size-3" /> Düzenle
                        </Link>
                        <button type="button" onClick={() => togglePassive(p)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-border text-foreground hover:border-gold">
                          <Power className="size-3" /> {p.status === "inactive" ? "Aktifleştir" : "Pasife Al"}
                        </button>
                        <button type="button" onClick={() => deletePart(p)}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10">
                          <Trash2 className="size-3" /> Sil
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <button onClick={async () => { await signOut(); nav({ to: "/" }); }}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-destructive/40 text-destructive font-semibold">
          <LogOut className="size-4" /> Çıkış Yap
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
