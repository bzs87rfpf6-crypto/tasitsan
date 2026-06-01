import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sell")({
  head: () => ({ meta: [{ title: "İlan Ver — Taşıtsan" }] }),
  component: SellPage,
});

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

function SellPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [profileWa, setProfileWa] = useState("");

  const [form, setForm] = useState({
    title: "", description: "", brand: "", model: "", year: "", oem_code: "",
    category: "Motor", condition: "used", price: "", stock_quantity: "1", city: "", whatsapp: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("whatsapp,city").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.whatsapp) {
        setProfileWa(data.whatsapp);
        setForm((f) => ({ ...f, whatsapp: data.whatsapp ?? "", city: data.city ?? f.city }));
      }
    });
  }, [user]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 6);
    setFiles(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (files.length === 0) { toast.error("En az 1 fotoğraf yükle"); return; }
    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      for (const f of files) {
        const ext = f.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("part-photos").upload(path, f, {
          cacheControl: "3600", upsert: false,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("part-photos").getPublicUrl(path);
        photoUrls.push(pub.publicUrl);
      }

      const { data, error } = await supabase.from("parts").insert({
        seller_id: user.id,
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
        whatsapp: form.whatsapp,
      }).select("id").single();
      if (error) throw error;

      if (form.whatsapp !== profileWa) {
        await supabase.from("profiles").update({ whatsapp: form.whatsapp, city: form.city || null }).eq("id", user.id);
      }

      toast.success("İlan yayınlandı!");
      nav({ to: "/parts/$id", params: { id: data.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Hata");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  return (
    <div className="min-h-screen pb-28">
      <AppHeader subtitle="Yeni İlan" />
      <form onSubmit={submit} className="max-w-md mx-auto px-4 pt-4 space-y-4">

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold">Fotoğraflar (en fazla 6)</label>
          <div className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-card">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {files.length < 6 && (
              <label className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-gold grid place-items-center cursor-pointer text-muted-foreground">
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => addFiles(e.target.files)} />
                <Upload className="size-6" />
              </label>
            )}
          </div>
        </section>

        <Input placeholder="Başlık (örn. Mercedes W211 Sağ Far)" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} className="h-12 bg-card" />

        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Marka" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="h-12 bg-card" />
          <Input placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="h-12 bg-card" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Yıl" inputMode="numeric" value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="h-12 bg-card" />
          <Input placeholder="Şehir" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-12 bg-card" />
        </div>

        <Input placeholder="OEM Kodu (opsiyonel)" value={form.oem_code}
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

        <div className="relative">
          <Input placeholder="Fiyat" inputMode="decimal" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })}
            className="h-12 bg-card pl-8" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold">₺</span>
        </div>

        <Textarea placeholder="Açıklama, uyumlu modeller, kusurlar..." value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4} className="bg-card resize-none" />

        <div>
          <label className="text-xs uppercase tracking-wider text-gold font-semibold mb-1.5 block">
            İletişim Telefonu (yalnızca Taşıtsan ekibine iletilir)
          </label>
          <Input placeholder="5xx xxx xx xx" value={form.whatsapp} required
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="h-12 bg-card" />
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            Numaranız ilan sayfasında gösterilmez. Talepler önce Taşıtsan tarafından değerlendirilir.
          </p>
        </div>


        <Button type="submit" disabled={submitting} className="w-full h-13 bg-gold-gradient text-gold-foreground font-semibold text-base shadow-gold py-4">
          {submitting ? "Yayınlanıyor..." : "İlanı Yayınla"}
        </Button>
      </form>
      <BottomNav />
    </div>
  );
}
