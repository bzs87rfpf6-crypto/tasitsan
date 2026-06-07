import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { OemInput } from "@/components/OemInput";
import { PART_TYPE_VALUES, PART_TYPE_META, type PartType } from "@/lib/part-type";
import { recordBulkClick } from "@/lib/bulkNavTrace";
import { createBrowserId } from "@/lib/browser-compat";
import { useServerFn } from "@tanstack/react-start";
import { executeRecaptcha } from "@/lib/recaptcha";
import { verifyRecaptcha } from "@/lib/recaptcha.functions";

// Browser-safe image MIME types. iOS HEIC/Apple ProRAW (.dng) cannot be rendered
// by <img>, and DNG files balloon memory enough to crash the tab into a reload.
const ACCEPTED_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const REJECTED_EXT = /\.(heic|heif|dng|raw|cr2|nef|arw|tif|tiff)$/i;

export const Route = createFileRoute("/sell/")({
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
    title: "", description: "", brand: "", model: "", year: "", engine_code: "",
    category: "Motor", condition: "used", price: "", stock_quantity: "1", city: "", whatsapp: "",
  });
  const [partType, setPartType] = useState<PartType | "">("");
  const [oemCodes, setOemCodes] = useState<string[]>([]);
  
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const openBulkUpload = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    recordBulkClick();
    window.location.assign("/sell/bulk");
  };

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profileRes, roleRes] = await Promise.all([
        supabase.rpc("get_my_profile").maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      if (cancelled) return;
      const data = profileRes.data as any;
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
    setFiles((prev) => [...prev, ...accepted].slice(0, 10));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (files.length < 1) { toast.error("En az 1 fotoğraf yüklemelisin."); return; }
    if (files.length > 10) { toast.error("En fazla 10 fotoğraf yükleyebilirsin."); return; }
    if (!form.price || parseFloat(form.price) <= 0) { toast.error("Geçerli bir fiyat girin."); return; }
    if (oemCodes.length === 0) { toast.error("En az bir OEM numarası girin."); return; }
    if (!partType) { toast.error("Parça tipi seçin."); return; }
    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      const { validateFile } = await import("@/lib/file-upload-validation");
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const v = await validateFile(f, "image");
        if (!v.ok) {
          throw new Error(`Fotoğraf ${i + 1} reddedildi: ${v.reason}`);
        }
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${user.id}/${createBrowserId("photo")}.${ext}`;
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
        oem_codes: oemCodes,
        engine_code: form.engine_code || null,
        category: form.category,
        condition: form.condition,
        part_type: partType,
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



  if (authLoading || !user || approvalState === "loading") {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  }

  if (approvalState === "pending") {
    return (
      <div className="min-h-screen pb-28">
        <AppHeader subtitle="Yeni İlan" />
        <div className="max-w-md mx-auto px-4 pt-10 text-center space-y-4">
          <div className="rounded-2xl border border-gold/30 bg-gold/5 px-5 py-6 space-y-3">
            <h2 className="font-display text-xl text-gold">Hesabın onay bekliyor</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Hesabın Taşıtsan ekibi tarafından inceleniyor. Onay verildikten sonra ilan
              yükleyebilirsin. Onay genellikle kısa sürede tamamlanır.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Acil bir durum varsa WhatsApp üzerinden bizimle iletişime geçebilirsin.
            </p>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <AppHeader subtitle="Yeni İlan" />
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <a
          href="/sell/bulk"
          onClick={openBulkUpload}
          className="w-full flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-left hover:bg-gold/15 transition no-underline"
        >
          <div>
            <div className="text-sm font-semibold text-gold">Toplu Parça Yükle</div>
            <div className="text-[11px] text-muted-foreground">Excel veya CSV ile birden fazla ilan</div>
          </div>
          <span className="text-gold text-lg">→</span>
        </a>
      </div>

      <form onSubmit={submit} className="max-w-md mx-auto px-4 pt-4 space-y-4">



        <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          <span className="text-gold font-semibold">Onay süreci:</span> Eklediğiniz ilanlar Taşıtsan ekibi tarafından incelendikten sonra yayınlanır.
        </div>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center justify-between">
            <span>Fotoğraflar (en az 3, en fazla 6)</span>
            <span className={`text-[10px] ${files.length >= 3 ? "text-emerald-400" : "text-muted-foreground"}`}>{files.length}/3</span>
          </label>
          {files.length > 0 && (
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
            </div>
          )}
          {files.length < 6 && (
            <PhotoPicker onFiles={(fl) => addFiles(fl)} />
          )}

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

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold">OEM Numaraları *</label>
          <OemInput value={oemCodes} onChange={setOemCodes} required />
        </div>

        <Input placeholder="Motor Kodu (örn. M271, OM651)" value={form.engine_code}
          onChange={(e) => setForm({ ...form, engine_code: e.target.value.toUpperCase() })}
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



        <div>
          <label className="text-xs uppercase tracking-wider text-gold font-semibold mb-1.5 block">Parça Tipi *</label>
          <div className="grid grid-cols-2 gap-2">
            {PART_TYPE_VALUES.map((v) => {
              const m = PART_TYPE_META[v];
              const active = partType === v;
              return (
                <button key={v} type="button" onClick={() => setPartType(v)}
                  className={`h-11 px-2 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1.5 ${
                    active ? "bg-gold-gradient text-gold-foreground border-transparent" : "border-border text-muted-foreground"
                  }`}>
                  <span aria-hidden>{m.emoji}</span>
                  <span className="truncate">{m.longLabel}</span>
                </button>
              );
            })}
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
