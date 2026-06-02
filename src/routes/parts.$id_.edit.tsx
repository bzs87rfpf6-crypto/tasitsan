import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, ArrowLeft } from "lucide-react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { OemInput } from "@/components/OemInput";

const ACCEPTED_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const REJECTED_EXT = /\.(heic|heif|dng|raw|cr2|nef|arw|tif|tiff)$/i;

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

export const Route = createFileRoute("/parts/$id_/edit")({
  head: () => ({ meta: [{ title: "İlan Düzenle — Taşıtsan" }] }),
  component: EditPartPage,
});

function EditPartPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notOwner, setNotOwner] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", brand: "", model: "", year: "", oem_code: "",
    category: "Motor", condition: "used", price: "", stock_quantity: "1", city: "",
  });
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("İlan bulunamadı");
        nav({ to: "/account" });
        return;
      }
      if (data.seller_id !== user.id) {
        setNotOwner(true);
        setLoading(false);
        return;
      }
      setForm({
        title: data.title ?? "",
        description: data.description ?? "",
        brand: data.brand ?? "",
        model: data.model ?? "",
        year: data.year?.toString() ?? "",
        oem_code: data.oem_code ?? "",
        category: data.category ?? "Motor",
        condition: data.condition ?? "used",
        price: data.price?.toString() ?? "",
        stock_quantity: data.stock_quantity?.toString() ?? "1",
        city: data.city ?? "",
      });
      setExistingPhotos((data.photos as string[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, id, nav]);

  const previews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);
  useEffect(() => () => { previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const totalPhotos = existingPhotos.length + newFiles.length;

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED_MIME.test(f.type) || REJECTED_EXT.test(f.name)) { rejected.push(f.name); continue; }
      if (f.size > 10 * 1024 * 1024) { rejected.push(`${f.name} (>10MB)`); continue; }
      accepted.push(f);
    }
    if (rejected.length) toast.error(`Desteklenmeyen: ${rejected.join(", ")}`);
    if (!accepted.length) return;
    setNewFiles((prev) => [...prev, ...accepted].slice(0, Math.max(0, 6 - existingPhotos.length)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (totalPhotos < 3) { toast.error("En az 3 fotoğraf olmalı."); return; }
    if (!form.price || parseFloat(form.price) <= 0) { toast.error("Geçerli fiyat girin."); return; }
    setSubmitting(true);
    try {
      const photoUrls = [...existingPhotos];
      for (const f of newFiles) {
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("part-photos")
          .upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type || "image/jpeg" });
        if (upErr) throw new Error(`Fotoğraf yüklenemedi: ${upErr.message}`);
        const { data: pub } = supabase.storage.from("part-photos").getPublicUrl(path);
        photoUrls.push(pub.publicUrl);
      }

      const { error } = await supabase.from("parts").update({
        title: form.title,
        description: form.description || null,
        brand: form.brand || null,
        model: form.model || null,
        year: form.year ? parseInt(form.year) : null,
        oem_code: form.oem_code || null,
        category: form.category,
        condition: form.condition,
        price: form.price ? parseFloat(form.price) : null,
        stock_quantity: form.stock_quantity ? Math.max(0, parseInt(form.stock_quantity)) : 1,
        city: form.city || null,
        photos: photoUrls,
      }).eq("id", id).eq("seller_id", user.id);
      if (error) throw error;

      toast.success("İlan güncellendi.");
      nav({ to: "/account" });
    } catch (err: any) {
      toast.error(err.message ?? "Hata");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }
  if (notOwner) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader subtitle="İlan Düzenle" />
        <div className="max-w-md mx-auto px-4 pt-10 text-center">
          <p className="text-sm text-muted-foreground">Sadece kendi ilanlarınızı düzenleyebilirsiniz.</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <AppHeader subtitle="İlan Düzenle" />
      <form onSubmit={submit} className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <button type="button" onClick={() => nav({ to: "/account" })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowLeft className="size-3.5" /> Hesabıma dön
        </button>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center justify-between">
            <span>Fotoğraflar (3-6)</span>
            <span className={`text-[10px] ${totalPhotos >= 3 ? "text-emerald-400" : "text-muted-foreground"}`}>{totalPhotos}/3</span>
          </label>
          {totalPhotos > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {existingPhotos.map((url, i) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-card">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setExistingPhotos(existingPhotos.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-card">
                  <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setNewFiles(newFiles.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {totalPhotos < 6 && (
            <PhotoPicker onFiles={(fl) => addFiles(fl)} />
          )}
        </section>

        <Input placeholder="Başlık" value={form.title} required maxLength={120}
          onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-12 bg-card" />

        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Marka" value={form.brand} required
            onChange={(e) => setForm({ ...form, brand: e.target.value })} className="h-12 bg-card" />
          <Input placeholder="Model" value={form.model} required
            onChange={(e) => setForm({ ...form, model: e.target.value })} className="h-12 bg-card" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Yıl" inputMode="numeric" value={form.year} required
            onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="h-12 bg-card" />
          <Input placeholder="Şehir" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-12 bg-card" />
        </div>

        <Input placeholder="OEM Kodu" value={form.oem_code} required
          onChange={(e) => setForm({ ...form, oem_code: e.target.value.toUpperCase() })}
          maxLength={60} className="h-12 bg-card font-mono" />

        <div>
          <label className="text-xs uppercase tracking-wider text-gold font-semibold mb-1.5 block">Kategori</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setForm({ ...form, category: c })}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                  form.category === c ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
                }`}>{c}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-gold font-semibold mb-1.5 block">Durum</label>
          <div className="grid grid-cols-3 gap-2">
            {[["new", "Sıfır"], ["refurbished", "Yenilenmiş"], ["used", "İkinci El"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm({ ...form, condition: v })}
                className={`h-11 rounded-lg text-xs font-semibold border ${
                  form.condition === v ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
                }`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Input placeholder="Fiyat" inputMode="decimal" value={form.price} required
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })}
              className="h-12 bg-card pl-8" />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold">₺</span>
          </div>
          <Input placeholder="Stok" inputMode="numeric" value={form.stock_quantity} required
            onChange={(e) => setForm({ ...form, stock_quantity: e.target.value.replace(/\D/g, "") })}
            className="h-12 bg-card" />
        </div>

        <Textarea placeholder="Açıklama" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4} className="bg-card resize-none" />

        <Button type="submit" disabled={submitting}
          className="w-full h-13 bg-gold-gradient text-gold-foreground font-semibold text-base shadow-gold py-4">
          {submitting ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </Button>
      </form>
      <BottomNav />
    </div>
  );
}
