// Faz 4/1 — Araç Profilleri (AI Asistan üstünde)
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyVehicles, upsertMyVehicle, deleteMyVehicle, setDefaultVehicle, type UserVehicle } from "@/lib/vehicles.functions";
import { Car, Plus, Star, StarOff, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SELECTED_KEY = "ts_selected_vehicle_id";

export function useSelectedVehicle(): [UserVehicle | null, (v: UserVehicle | null) => void, UserVehicle[]] {
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [selected, setSelected] = useState<UserVehicle | null>(null);
  const list = useServerFn(listMyVehicles);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      try {
        const rows = await list();
        if (cancelled) return;
        setVehicles(rows);
        const stored = typeof window !== "undefined" ? localStorage.getItem(SELECTED_KEY) : null;
        const pick = rows.find((v) => v.id === stored) ?? rows.find((v) => v.is_default) ?? rows[0] ?? null;
        setSelected(pick);
      } catch { /* not signed in */ }
    })();
    return () => { cancelled = true };
  }, [list]);

  const set = (v: UserVehicle | null) => {
    setSelected(v);
    try {
      if (v) localStorage.setItem(SELECTED_KEY, v.id);
      else localStorage.removeItem(SELECTED_KEY);
    } catch { /* ignore */ }
  };
  return [selected, set, vehicles];
}

export function VehicleProfileBar({ onSelect }: { onSelect?: (v: UserVehicle | null) => void }) {
  const [selected, setSelected, vehicles] = useSelectedVehicle();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSignedIn(!!s));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { onSelect?.(selected); }, [selected, onSelect]);

  if (signedIn === false) {
    return (
      <div className="text-xs text-muted-foreground">
        <a href="/auth" rel="nofollow" className="underline">Giriş yap</a> — araçlarını kaydet, AI aramaların otomatik senin aracına özel olsun.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Car className="size-4 text-primary" />
      <span className="text-xs text-muted-foreground">Aracın:</span>
      {vehicles.length === 0 ? (
        <button onClick={() => setOpen(true)} className="text-xs font-medium px-2 py-1 rounded-full border border-primary/40 bg-primary/5 hover:bg-primary/10 inline-flex items-center gap-1">
          <Plus className="size-3" /> Araç ekle
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelected(null)}
              className={`text-xs px-2 py-1 rounded-full border transition ${!selected ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}
            >Genel</button>
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`text-xs px-2 py-1 rounded-full border transition ${selected?.id === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}
              >
                {v.label ?? `${v.brand} ${v.model}${v.year ? ` ${v.year}` : ""}`}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(true)} className="text-xs underline text-muted-foreground hover:text-foreground">
            Yönet
          </button>
        </>
      )}
      {open && <VehicleManager onClose={() => setOpen(false)} onChange={() => { /* handled inside */ }} />}
    </div>
  );
}

function VehicleManager({ onClose }: { onClose: () => void; onChange: () => void }) {
  const list = useServerFn(listMyVehicles);
  const upsert = useServerFn(upsertMyVehicle);
  const del = useServerFn(deleteMyVehicle);
  const setDef = useServerFn(setDefaultVehicle);
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [form, setForm] = useState<{ brand: string; model: string; year: string; engine: string; label: string }>({ brand: "", model: "", year: "", engine: "", label: "" });
  const [saving, setSaving] = useState(false);

  const reload = async () => setVehicles(await list());
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand || !form.model) { toast.error("Marka ve model zorunlu"); return; }
    setSaving(true);
    try {
      await upsert({ data: {
        brand: form.brand, model: form.model,
        year: form.year ? Number(form.year) : null,
        engine: form.engine || null,
        label: form.label || null,
        is_default: vehicles.length === 0,
      }});
      setForm({ brand: "", model: "", year: "", engine: "", label: "" });
      await reload();
      toast.success("Araç eklendi");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Hata"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border w-full max-w-md p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Car className="size-5 text-primary" />
          <h3 className="font-semibold">Araçlarım</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted"><X className="size-4" /></button>
        </div>

        <div className="space-y-1.5 mb-4">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
              <button
                onClick={async () => { await setDef({ data: { id: v.id }}); await reload(); }}
                title={v.is_default ? "Varsayılan" : "Varsayılan yap"}
                className={v.is_default ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}
              >{v.is_default ? <Star className="size-4 fill-current" /> : <StarOff className="size-4" />}</button>
              <div className="text-sm min-w-0 flex-1">
                <div className="font-medium truncate">{v.label ?? `${v.brand} ${v.model}`}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[v.brand, v.model, v.year, v.engine].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                onClick={async () => { if (confirm("Sil?")) { await del({ data: { id: v.id }}); await reload(); }}}
                className="p-1 rounded text-rose-600 hover:bg-rose-500/10"
              ><Trash2 className="size-4" /></button>
            </div>
          ))}
          {vehicles.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Henüz araç yok. Aşağıdan ekle.</div>}
        </div>

        <form onSubmit={save} className="space-y-2 border-t border-border pt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Yeni Araç</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Marka *" className="text-sm px-2.5 py-1.5 rounded border border-border bg-background" />
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Model *" className="text-sm px-2.5 py-1.5 rounded border border-border bg-background" />
            <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Yıl" inputMode="numeric" className="text-sm px-2.5 py-1.5 rounded border border-border bg-background" />
            <input value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} placeholder="Motor (ör. 2.4 4x4)" className="text-sm px-2.5 py-1.5 rounded border border-border bg-background" />
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Etiket (opsiyonel)" className="col-span-2 text-sm px-2.5 py-1.5 rounded border border-border bg-background" />
          </div>
          <Button type="submit" size="sm" disabled={saving} className="w-full">
            <Check className="size-4 mr-1" /> Ekle
          </Button>
        </form>
      </div>
    </div>
  );
}
