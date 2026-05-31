import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { PartCard, type Part } from "@/components/PartCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Hesabım — Taşıtsan" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState({ display_name: "", whatsapp: "", city: "" });
  const [myParts, setMyParts] = useState<Part[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name,whatsapp,city").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setProfile({ display_name: data.display_name ?? "", whatsapp: data.whatsapp ?? "", city: data.city ?? "" });
    });
    supabase.from("parts").select("id,title,brand,model,year,price,city,photos,condition")
      .eq("seller_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setMyParts((data ?? []) as Part[]));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update(profile).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profil güncellendi");
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader subtitle="Hesabım" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-6">

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
            <div className="grid grid-cols-2 gap-3">
              {myParts.map((p) => <PartCard key={p.id} part={p} />)}
            </div>
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
