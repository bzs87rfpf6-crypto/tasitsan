import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Trash2, ArrowLeft, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Kayıtlı Parça Alarmlarım — Taşıtsan" }] }),
  component: AlertsPage,
});

interface Alert {
  id: string;
  keyword: string | null;
  brand: string | null;
  model: string | null;
  oem_code: string | null;
  category: string | null;
  is_active: boolean;
  last_matched_at: string | null;
  match_count: number;
  created_at: string;
}

function AlertsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Alert[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("part_alerts")
      .select("id,keyword,brand,model,oem_code,category,is_active,last_matched_at,match_count,created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(translateError(error));
    setItems((data ?? []) as Alert[]);
    setBusy(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (a: Alert) => {
    const { error } = await supabase.from("part_alerts").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) { toast.error(translateError(error)); return; }
    setItems((xs) => xs.map((x) => x.id === a.id ? { ...x, is_active: !a.is_active } : x));
  };

  const remove = async (a: Alert) => {
    if (!confirm("Alarmı silmek istediğinize emin misiniz?")) return;
    const { error } = await supabase.from("part_alerts").delete().eq("id", a.id);
    if (error) { toast.error(translateError(error)); return; }
    setItems((xs) => xs.filter((x) => x.id !== a.id));
    toast.success("Alarm silindi");
  };

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader subtitle="Parça Alarmlarım" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <Link to="/account" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-3.5" /> Hesabım
        </Link>

        <div className="bg-card border border-border rounded-xl p-4">
          <h1 className="font-display text-lg text-gold">Kayıtlı Parça Alarmlarım</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Aradığınız parça sisteme eklendiğinde anında bildirim alın.
          </p>
        </div>

        {busy ? (
          <p className="text-sm text-muted-foreground text-center py-8">Yükleniyor...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-10 px-4 space-y-3 bg-card border border-border rounded-xl">
            <div className="size-14 rounded-full bg-gold/10 grid place-items-center mx-auto">
              <PackageSearch className="size-7 text-gold" />
            </div>
            <p className="text-sm text-muted-foreground">Henüz alarm kaydetmediniz.</p>
            <Link to="/" className="inline-block">
              <Button className="bg-gold-gradient text-gold-foreground font-semibold">Arama Yap</Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    {a.keyword && <p className="text-sm font-semibold leading-tight">{a.keyword}</p>}
                    {a.oem_code && <p className="text-[11px] font-mono text-gold">OEM: {a.oem_code}</p>}
                    {(a.brand || a.model) && (
                      <p className="text-[11px] text-muted-foreground">
                        {[a.brand, a.model].filter(Boolean).join(" • ")}
                      </p>
                    )}
                    {a.category && (
                      <span className="inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                        {a.category}
                      </span>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {a.match_count > 0
                        ? `${a.match_count} eşleşme bulundu`
                        : "Henüz eşleşme yok"}
                    </p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
                    a.is_active
                      ? "text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
                      : "text-muted-foreground border-border bg-muted/30"
                  }`}>
                    {a.is_active ? "Aktif" : "Pasif"}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => toggle(a)}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-border hover:border-gold"
                  >
                    {a.is_active ? <><BellOff className="size-3" /> Kapat</> : <><Bell className="size-3" /> Aç</>}
                  </button>
                  <button
                    onClick={() => remove(a)}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3" /> Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
