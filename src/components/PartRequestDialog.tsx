import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const ACCEPTED_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const REJECTED_EXT = /\.(heic|heif|dng|raw|cr2|nef|arw|tif|tiff)$/i;


const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

export interface PartRequestInitial {
  search_query?: string;
  brand?: string;
  model?: string;
  year?: string;
  oem?: string;
  category?: string;
}

export function PartRequestDialog({
  open, onOpenChange, userId, initial = {},
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  initial?: PartRequestInitial;
}) {
  const [form, setForm] = useState({
    part_name: "",
    oem_code: "",
    brand: "",
    model: "",
    year: "",
    category: "",
    description: "",
    full_name: "",
    phone: "",
    email: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Prefill from search context once dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setForm((f) => ({
        ...f,
        part_name: f.part_name || initial.search_query || "",
        brand: f.brand || initial.brand || "",
        model: f.model || initial.model || "",
        year: f.year || initial.year || "",
        oem_code: f.oem_code || initial.oem || "",
        category: f.category || initial.category || "",
      }));
    }
    onOpenChange(v);
  };

  // Stable blob URLs to prevent iOS memory exhaustion (which can force the
  // page to auto-reload after picking many photos).
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => { previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED_MIME.test(f.type) || REJECTED_EXT.test(f.name)) {
        rejected.push(f.name);
        console.warn("[part-request] rejected:", f.name, f.type);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        rejected.push(`${f.name} (>10MB)`);
        continue;
      }
      accepted.push(f);
    }
    if (rejected.length) toast.error(`Desteklenmeyen dosya: ${rejected.join(", ")}.`);
    if (accepted.length) setFiles((prev) => [...prev, ...accepted].slice(0, 4));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) { toast.error("Talep oluşturmak için giriş yapmalısınız."); return; }
    if (!form.part_name.trim()) { toast.error("Parça adı zorunludur."); return; }
    if (!form.brand.trim() || !form.model.trim()) { toast.error("Marka ve model zorunludur."); return; }
    if (!form.full_name.trim() || !form.phone.trim()) { toast.error("Ad soyad ve telefon zorunludur."); return; }

    setSubmitting(true);
    try {
      const photoUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
        // IMPORTANT: storage RLS requires first folder = auth.uid(). The path
        // MUST start with `${userId}/...` — never `requests/${userId}/...`.
        const path = `${userId}/req-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("part-photos")
          .upload(path, f, { cacheControl: "3600", upsert: false, contentType: f.type || "image/jpeg" });
        if (upErr) {
          console.error(`[part-request] upload failed for ${f.name}`, { path, error: upErr });
          throw new Error(`Fotoğraf ${i + 1} yüklenemedi: ${upErr.message}`);
        }
        const { data: pub } = supabase.storage.from("part-photos").getPublicUrl(path);
        photoUrls.push(pub.publicUrl);
      }

      const { error } = await supabase.from("part_requests").insert({
        buyer_id: userId,
        part_name: form.part_name.trim(),
        search_query: form.part_name.trim(),
        oem_code: form.oem_code.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? parseInt(form.year) : null,
        category: form.category || null,
        description: form.description.trim() || null,
        photos: photoUrls,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        message: form.description.trim() || form.part_name.trim(),
      });
      if (error) { console.error("[part-request] insert failed:", error); throw error; }
      toast.success("Talebiniz alındı. Satıcılar teklif verecek, Taşıtsan onay sonrası size iletecek.");
      setForm({ part_name: "", oem_code: "", brand: "", model: "", year: "", category: "", description: "", full_name: "", phone: "", email: "" });
      setFiles([]);
      onOpenChange(false);
    } catch (err: any) {
      console.error("[part-request] submit error:", err);
      toast.error(err.message ?? "Talep gönderilemedi");
    } finally {

      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Akıllı Parça Talebi</DialogTitle>
          <DialogDescription>
            Talebiniz ilgili kategorideki satıcılara iletilir. Onaylı teklifler size geri döner; iletişim Taşıtsan üzerinden yürür.
          </DialogDescription>
        </DialogHeader>

        {!userId ? (
          <div className="text-sm text-muted-foreground py-4">
            Talep oluşturmak için <Link to="/auth" className="text-gold font-semibold">giriş yapın</Link>.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2.5">
            <Input placeholder="Parça Adı *" value={form.part_name} maxLength={120}
              onChange={(e) => setForm({ ...form, part_name: e.target.value })} />
            <Input placeholder="OEM Kodu (opsiyonel)" className="font-mono" value={form.oem_code} maxLength={60}
              onChange={(e) => setForm({ ...form, oem_code: e.target.value.toUpperCase() })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Marka *" value={form.brand} maxLength={40}
                onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              <Input placeholder="Model *" value={form.model} maxLength={40}
                onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Model Yılı" inputMode="numeric" value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
              <select value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Kategori</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-gold font-semibold">Fotoğraflar (opsiyonel, en fazla 4)</label>
              <div className="grid grid-cols-4 gap-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${f.lastModified}-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-card border border-border">
                    <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 size-5 rounded-full bg-background/90 grid place-items-center">
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {files.length < 4 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-border grid place-items-center cursor-pointer hover:border-gold/50 transition-colors">
                    <Upload className="size-4 text-muted-foreground" />
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
                      onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>

            </div>

            <Textarea placeholder="Açıklama (parçanın detayı, kullanım yeri, vb.)" rows={3} maxLength={600}
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="resize-none" />

            <div className="pt-1.5 border-t border-border" />
            <Input placeholder="Ad Soyad *" value={form.full_name} maxLength={100}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telefon *" inputMode="tel" value={form.phone} maxLength={20}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input placeholder="E-posta" type="email" value={form.email} maxLength={120}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={submitting} className="w-full bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
                {submitting ? "Gönderiliyor..." : "Talebi Gönder"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
