import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LogOut, Package, Heart, ClipboardList, Bell, Flame, KeyRound } from "lucide-react";
import { MyListingsManager, type ManagerPart } from "@/components/account/MyListingsManager";
import { ImportBatchesPanel } from "@/components/account/ImportBatchesPanel";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { AdminQuickAccess } from "@/components/AdminQuickAccess";

import { AvatarUploader } from "@/components/AvatarUploader";
import { SellerVerification } from "@/components/SellerVerification";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userChangePassword } from "@/lib/admin.functions";

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [
      { title: "Hesabım — Taşıtsan Parça Borsası" },
      { name: "description", content: "Taşıtsan hesabını yönet: ilanlarını görüntüle, profilini güncelle ve bildirim tercihlerini ayarla." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:url", content: "https://www.tasitsan.com.tr/account" },
    ],
    links: [{ rel: "canonical", href: "https://www.tasitsan.com.tr/account" }],
  }),
  component: AccountPage,
});

type MyPart = ManagerPart;


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
    // Paginate past the Supabase-js 1000-row default so sellers with more
    // than 1000 listings still see (and can search) every one of them.
    const PAGE = 1000;
    const cols = "id,seo_slug,title,brand,model,category,price,photos,status,stock_quantity,oem_code,oem_codes,created_at,updated_at,is_sold";
    const all: MyPart[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("parts")
        .select(cols)
        .eq("seller_id", uid)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) break;
      const batch = (data ?? []) as MyPart[];
      all.push(...batch);
      if (batch.length < PAGE) break;
    }
    setMyParts(all);
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


  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;

  // KPI hesaplama — myParts zaten yüklendiği için ekstra sorgu yok.
  // Sadece giriş yapan kullanıcının kayıtları üzerinden hesaplanır.
  const kpi = (() => {
    const total = myParts.length;
    const active = myParts.filter((p) => p.status === "approved").length;
    const pending = myParts.filter((p) => p.status === "pending").length;
    const inactive = myParts.filter((p) => p.status === "inactive" || p.status === "rejected").length;
    const stockUnits = myParts.reduce((s, p) => s + Math.max(0, p.stock_quantity ?? 0), 0);
    const stockValue = myParts.reduce(
      (s, p) => s + Math.max(0, p.stock_quantity ?? 0) * Math.max(0, Number(p.price ?? 0)),
      0,
    );
    return { total, active, pending, inactive, stockUnits, stockValue };
  })();
  const fmtMoney = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M ₺`
      : n >= 1000
        ? `${(n / 1000).toFixed(1)}K ₺`
        : `${Math.round(n)} ₺`;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader subtitle="Hesabım" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-6">

        <AdminQuickAccess />

        {/* Satıcı KPI özeti — giriş yapan kullanıcıya özel */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Toplam İlan</p>
            <p className="font-display text-2xl text-foreground mt-1">{kpi.total}</p>
          </div>
          <div className="bg-card border border-emerald-400/30 rounded-xl p-3">
            <p className="text-[10px] text-emerald-400 uppercase tracking-wider">Aktif (Yayında)</p>
            <p className="font-display text-2xl text-emerald-400 mt-1">{kpi.active}</p>
          </div>
          <div className="bg-card border border-amber-400/30 rounded-xl p-3">
            <p className="text-[10px] text-amber-400 uppercase tracking-wider">Onay Bekleyen</p>
            <p className="font-display text-2xl text-amber-400 mt-1">{kpi.pending}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pasif / Reddedilen</p>
            <p className="font-display text-2xl text-muted-foreground mt-1">{kpi.inactive}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stok Adedi</p>
            <p className="font-display text-2xl text-foreground mt-1">{kpi.stockUnits}</p>
          </div>
          <div className="bg-card border border-gold/40 rounded-xl p-3">
            <p className="text-[10px] text-gold uppercase tracking-wider">Stok Değeri</p>
            <p className="font-display text-2xl text-gold mt-1">{fmtMoney(kpi.stockValue)}</p>
          </div>
        </div>


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

        <div className="grid grid-cols-2 gap-3">
          <Link to="/account/orders" className="flex items-center gap-3 bg-card border border-border hover:border-gold rounded-xl p-3 transition">
            <span className="size-9 rounded-full bg-gold/10 grid place-items-center"><Package className="size-4 text-gold" /></span>
            <span className="text-xs font-semibold">Siparişlerim</span>
          </Link>
          <Link to="/account/sales" className="flex items-center gap-3 bg-card border border-border hover:border-gold rounded-xl p-3 transition">
            <span className="size-9 rounded-full bg-emerald-500/10 grid place-items-center"><Package className="size-4 text-emerald-400" /></span>
            <span className="text-xs font-semibold">Satışlarım</span>
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

        <Link
          to="/account/xml-feeds"
          className="block bg-card border border-border hover:border-gold rounded-xl p-4 transition"
        >
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-lg bg-emerald-400/10 grid place-items-center shrink-0">
              <Flame className="size-4 text-emerald-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-tight">XML Entegrasyonları</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ürünlerinizi XML linkleri ile otomatik aktarın (admin onayı gerekir).
              </p>
            </div>
            <span className="text-muted-foreground shrink-0">→</span>
          </div>
        </Link>

        <Link
          to="/account/stok"
          className="block bg-card border border-border hover:border-gold rounded-xl p-4 transition"
        >
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-lg bg-gold/15 grid place-items-center shrink-0">
              <Flame className="size-4 text-gold" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-tight">📦 Taşıtsan Stok Borsası</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Fazla / atıl stoğunuzu toplu olarak satışa çıkarın, teklif toplayın.
              </p>
            </div>
            <span className="text-muted-foreground shrink-0">→</span>
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
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
            <KeyRound className="size-4" /> Şifre Değiştir
          </h2>
          <Input type="password" autoComplete="current-password" placeholder="Mevcut şifre"
            value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="h-11 bg-background" />
          <Input type="password" autoComplete="new-password" placeholder="Yeni şifre (en az 6 karakter)"
            value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="h-11 bg-background" />
          <Input type="password" autoComplete="new-password" placeholder="Yeni şifre (tekrar)"
            value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="h-11 bg-background" />
          <Button onClick={changePassword} disabled={changingPw || !pw.current || !pw.next}
            className="w-full bg-gold-gradient text-gold-foreground font-semibold">
            {changingPw ? "Güncelleniyor..." : "Şifreyi Güncelle"}
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
            <Link to="/sell" search={{ oem: undefined, title: undefined, brand: undefined, model: undefined, category: undefined }} className="text-xs text-gold font-semibold">+ Yeni</Link>
          </div>
          <MyListingsManager
            userId={user.id}
            parts={myParts}
            onRefresh={() => loadParts(user.id)}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
            <Package className="size-4" /> Toplu Yüklemelerim
          </h2>
          <ImportBatchesPanel onChanged={() => loadParts(user.id)} />
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
