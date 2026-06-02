import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Browser-safe image MIME types. iOS HEIC/Apple ProRAW (.dng) cannot be rendered
// by <img>, and DNG files balloon memory enough to crash the tab into a reload.
const ACCEPTED_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const REJECTED_EXT = /\.(heic|heif|dng|raw|cr2|nef|arw|tif|tiff)$/i;

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
  const [approvalState, setApprovalState] = useState<"loading" | "approved" | "pending">("loading");

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
    let cancelled = false;
    (async () => {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("whatsapp,city,is_approved").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      if (cancelled) return;
      const data = profileRes.data;
      if (data?.whatsapp) {
        setProfileWa(data.whatsapp);
        setForm((f) => ({ ...f, whatsapp: data.whatsapp ?? "", city: data.city ?? f.city }));
      }
      const approved = !!roleRes.data || !!data?.is_approved;
      setApprovalState(approved ? "approved" : "pending");
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Stable blob URLs keyed by File so we don't recreate them every render
  // (which on iOS Safari leaks memory and forces the page to reload).
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => { previews.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previews]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      const isImage = ACCEPTED_MIME.test(f.type);
      const badExt = REJECTED_EXT.test(f.name);
      if (!isImage || badExt) {
        rejected.push(f.name);
        console.warn("[sell] rejected file:", f.name, "mime:", f.type, "size:", f.size);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        rejected.push(`${f.name} (>10MB)`);
        console.warn("[sell] file too large:", f.name, f.size);
        continue;
      }
      accepted.push(f);
    }
    if (rejected.length > 0) {
      toast.error(`Desteklenmeyen dosya: ${rejected.join(", ")}. Sadece JPG/PNG/WebP yükleyin (HEIC, DNG, RAW desteklenmez).`);
    }
    if (accepted.length === 0) return;
    setFiles((prev) => [...prev, ...accepted].slice(0, 6));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (files.length < 3) { toast.error("En az 3 fotoğraf yüklemelisin."); return; }
    if (!form.price || parseFloat(form.price) <= 0) { toast.error("Geçerli bir fiyat girin."); return; }
    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from("part-photos")
          .upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type || "image/jpeg" });
        if (upErr) {
          console.error(`[sell] upload failed for ${f.name}`, { path, error: upErr });
          throw new Error(`Fotoğraf ${i + 1} yüklenemedi: ${upErr.message}`);
        }
        console.info("[sell] uploaded:", upData?.path ?? path);
        const { data: pub } = supabase.storage.from("part-photos").getPublicUrl(path);
        photoUrls.push(pub.publicUrl);
      }

      const { error } = await supabase.from("parts").insert({
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
        status: "pending",
      });
      if (error) { console.error("[sell] parts insert failed:", error); throw error; }

      if (form.whatsapp !== profileWa) {
        await supabase.from("profiles").update({ whatsapp: form.whatsapp, city: form.city || null }).eq("id", user.id);
      }

      toast.success("İlanınız admin onayına gönderildi.");
      nav({ to: "/" });
    } catch (err: any) {
      console.error("[sell] submit error:", err);
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

        <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-gold font-semibold">Onay süreci:</span> Eklediğiniz ilanlar Taşıtsan ekibi tarafından incelendikten sonra yayınlanır.
        </div>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center justify-between">
            <span>Fotoğraflar (en az 3, en fazla 6)</span>
            <span className={`text-[10px] ${files.length >= 3 ? "text-emerald-400" : "text-muted-foreground"}`}>{files.length}/3</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${f.lastModified}-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-card">
                <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {files.length < 6 && (
              <label className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-gold grid place-items-center cursor-pointer text-muted-foreground">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <Upload className="size-6" />
              </label>
            )}
          </div>

        </section>


        <Input placeholder="Başlık (örn. Mercedes W211 Sağ Far)" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} className="h-12 bg-card" />

        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Marka *" value={form.brand} required onChange={(e) => setForm({ ...form, brand: e.target.value })} className="h-12 bg-card" />
          <Input placeholder="Model *" value={form.model} required onChange={(e) => setForm({ ...form, model: e.target.value })} className="h-12 bg-card" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Model Yılı *" inputMode="numeric" value={form.year} required
            onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="h-12 bg-card" />
          <Input placeholder="Şehir" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-12 bg-card" />
        </div>

        <Input placeholder="OEM Kodu *" value={form.oem_code} required
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
            <Input placeholder="Fiyat *" inputMode="decimal" value={form.price} required
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })}
              className="h-12 bg-card pl-8" />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold">₺</span>
          </div>
          <Input placeholder="Stok Adedi *" inputMode="numeric" value={form.stock_quantity} required
            onChange={(e) => setForm({ ...form, stock_quantity: e.target.value.replace(/\D/g, "") })}
            className="h-12 bg-card" />
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
          {submitting ? "Gönderiliyor..." : "Onaya Gönder"}
        </Button>
      </form>
      <BottomNav />
    </div>
  );
}
