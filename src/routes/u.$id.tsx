import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package, Calendar, Phone, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { UserAvatar } from "@/components/UserAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { SafePartImage } from "@/components/SafePartImage";

export const Route = createFileRoute("/u/$id")({
  head: () => ({ meta: [{ title: "Satıcı Profili — Taşıtsan" }] }),
  component: PublicProfilePage,
});

interface Profile {
  id: string;
  display_name: string | null;
  city: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;
  whatsapp: string | null;
  verified_phone: string | null;
}

const digits = (s: string | null) => (s ?? "").replace(/\D+/g, "");
const fmtTr = (s: string | null) => {
  const d = digits(s);
  if (!d) return s ?? "";
  const local = d.startsWith("90") ? d.slice(2) : d;
  if (local.length === 10) return `0${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6,8)} ${local.slice(8,10)}`;
  return s ?? "";
};

interface PartCard {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  photos: string[] | null;
}

function PublicProfilePage() {
  const { id } = useParams({ from: "/u/$id" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [parts, setParts] = useState<PartCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: ps }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,display_name,city,avatar_url,is_verified,created_at")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("parts")
          .select("id,title,brand,model,price,photos")
          .eq("seller_id", id)
          .eq("status", "approved")
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setProfile((p as Profile | null) ?? null);
      setParts((ps ?? []) as PartCard[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }
  if (!profile) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader subtitle="Profil" />
        <p className="text-center text-muted-foreground py-16">Kullanıcı bulunamadı.</p>
        <BottomNav />
      </div>
    );
  }

  const joined = new Date(profile.created_at).toLocaleDateString("tr-TR", {
    year: "numeric", month: "long",
  });

  return (
    <div className="min-h-screen pb-24">
      <AppHeader subtitle="Satıcı Profili" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-6">
        <section className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
          <UserAvatar url={profile.avatar_url} name={profile.display_name} size={80} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl tracking-wide truncate flex items-center gap-1.5">
              <span className="truncate">{profile.display_name ?? "Satıcı"}</span>
              {profile.is_verified && <VerifiedBadge size={18} />}
            </h1>
            {profile.is_verified && (
              <p className="text-[11px] text-sky-400 font-semibold">Doğrulanmış Satıcı</p>
            )}
            {profile.city && (
              <p className="text-xs text-muted-foreground truncate">{profile.city}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3 text-gold" /> {joined}
              </span>
              <span className="inline-flex items-center gap-1">
                <Package className="size-3 text-gold" /> {parts.length} ilan
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center gap-1.5">
            <Package className="size-4" /> İlanları ({parts.length})
          </h2>
          {parts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aktif ilanı yok.</p>
          ) : (
            <ul className="space-y-3">
              {parts.map((p) => (
                <li key={p.id} className="bg-card border border-border rounded-xl p-3 flex gap-3">
                  <Link to="/parts/$id" params={{ id: p.id }} className="size-20 shrink-0 rounded-lg overflow-hidden bg-secondary block">
                    <SafePartImage images={p.photos} alt={p.title} width={160} className="w-full h-full object-cover" />
                  </Link>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Link to="/parts/$id" params={{ id: p.id }} className="text-sm font-semibold leading-tight line-clamp-2 hover:text-gold">
                      {p.title}
                    </Link>
                    {(p.brand || p.model) && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {[p.brand, p.model].filter(Boolean).join(" • ")}
                      </p>
                    )}
                    <div className="text-gold font-bold text-sm font-display tracking-wider">
                      {p.price != null ? `₺${Number(p.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
