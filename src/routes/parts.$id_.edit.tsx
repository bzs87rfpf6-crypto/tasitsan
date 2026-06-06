import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, ArrowLeft, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PhotoPicker } from "@/components/PhotoPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { OemInput } from "@/components/OemInput";
import { StockInsightsCard } from "@/components/StockInsightsCard";
import { PART_TYPE_VALUES, PART_TYPE_META, type PartType } from "@/lib/part-type";

const ACCEPTED_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/i;
const REJECTED_EXT = /\.(heic|heif|dng|raw|cr2|nef|arw|tif|tiff)$/i;
const MAX_PHOTOS = 10;
const MIN_PHOTOS = 1;

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

type PhotoItem =
  | { id: string; kind: "existing"; url: string }
  | { id: string; kind: "new"; file: File; preview: string };

export const Route = createFileRoute("/parts/$id_/edit")({
  head: () => ({ meta: [{ title: "İlan Düzenle — Taşıtsan" }] }),
  component: EditPartPage,
});

function SortablePhoto({
  item,
  onRemove,
  isPrimary,
}: {
  item: PhotoItem;
  onRemove: () => void;
  isPrimary: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
  };
  const src = item.kind === "existing" ? item.url : item.preview;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-square rounded-lg overflow-hidden bg-card border ${
        isDragging ? "border-gold ring-2 ring-gold/40" : "border-transparent"
      }`}
    >
      <img src={src} alt="" className="w-full h-full object-cover pointer-events-none select-none" draggable={false} />
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Sürükle ve sırayı değiştir"
        className="absolute inset-x-0 bottom-0 h-7 flex items-center justify-center gap-1 bg-background/70 backdrop-blur-sm text-[10px] uppercase tracking-wider text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="size-3" />
        Sürükle
      </button>
      {isPrimary && (
        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-gold text-gold-foreground text-[9px] font-bold uppercase tracking-wider">
          Kapak
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Fotoğrafı kaldır"
        className="absolute top-1 right-1 size-6 rounded-full bg-background/80 grid place-items-center"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function EditPartPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notOwner, setNotOwner] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", brand: "", model: "", year: "", engine_code: "",
    category: "Motor", condition: "used", price: "", stock_quantity: "1", city: "",
  });
  const [oemCodes, setOemCodes] = useState<string[]>([]);
  const [partType, setPartType] = useState<PartType | "">("");
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
        engine_code: data.engine_code ?? "",
        category: data.category ?? "Motor",
        condition: data.condition ?? "used",
        price: data.price?.toString() ?? "",
        stock_quantity: data.stock_quantity?.toString() ?? "1",
        city: data.city ?? "",
      });
      const photos = (data.photos as string[]) ?? [];
      setItems(
        photos.map((url, i) => ({ id: `existing-${i}-${url}`, kind: "existing" as const, url })),
      );
      const arr = (data.oem_codes as string[] | null) ?? (data.oem_code ? [data.oem_code] : []);
      setOemCodes(arr);
      setPartType(((data as any).part_type as PartType | null) ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, id, nav]);

  // Revoke object URLs for any 'new' items when unmounting.
  useEffect(() => {
    return () => {
      items.forEach((it) => { if (it.kind === "new") URL.revokeObjectURL(it.preview); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED_MIME.test(f.type) || REJECTED_EXT.test(f.name)) { rejected.push(f.name); continue; }
      if (f.size > 10 * 1024 * 1024) { rejected.push(`${f.name} (>10MB)`); continue; }
      accepted.push(f);
    }
    if (rejected.length) toast.error(`Desteklenmeyen: ${rejected.join(", ")}. Sadece JPG/PNG/WebP yükleyin.`);
    if (!accepted.length) return;
    const remaining = Math.max(0, MAX_PHOTOS - items.length);
    if (remaining === 0) { toast.error(`En fazla ${MAX_PHOTOS} fotoğraf yükleyebilirsiniz.`); return; }
    const next: PhotoItem[] = accepted.slice(0, remaining).map((file) => ({
      id: `new-${crypto.randomUUID()}`,
      kind: "new" as const,
      file,
      preview: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const removeItem = (item: PhotoItem) => {
    if (item.kind === "existing") {
      setRemovedPhotos((prev) => (prev.includes(item.url) ? prev : [...prev, item.url]));
    } else {
      URL.revokeObjectURL(item.preview);
    }
    setItems((prev) => prev.filter((it) => it.id !== item.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((it) => it.id === active.id);
      const newIndex = prev.findIndex((it) => it.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const extractStoragePath = (url: string): string | null => {
    const marker = "/storage/v1/object/public/part-photos/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    try {
      return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    } catch {
      return url.slice(idx + marker.length).split("?")[0];
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (items.length < MIN_PHOTOS) { toast.error(`En az ${MIN_PHOTOS} fotoğraf olmalı.`); return; }
    if (items.length > MAX_PHOTOS) { toast.error(`En fazla ${MAX_PHOTOS} fotoğraf yükleyebilirsiniz.`); return; }
    if (!form.price || parseFloat(form.price) <= 0) { toast.error("Geçerli fiyat girin."); return; }
    setSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      // Upload new files, preserving order.
      const uploadedUrls = new Map<string, string>();
      for (const it of items) {
        if (it.kind !== "new") continue;
        const ext = (it.file.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("part-photos")
          .upload(path, it.file, { cacheControl: "3600", upsert: false, contentType: it.file.type || "image/jpeg" });
        if (upErr) throw new Error(`Fotoğraf yüklenemedi: ${upErr.message}`);
        uploadedPaths.push(path);
        const { data: pub } = supabase.storage.from("part-photos").getPublicUrl(path);
        uploadedUrls.set(it.id, pub.publicUrl);
      }

      const photoUrls = items.map((it) =>
        it.kind === "existing" ? it.url : (uploadedUrls.get(it.id) as string),
      );

      const { error } = await supabase.from("parts").update({
        title: form.title,
        description: form.description || null,
        brand: form.brand || null,
        model: form.model || null,
        year: form.year ? parseInt(form.year) : null,
        oem_codes: oemCodes,
        engine_code: form.engine_code || null,
        category: form.category,
        condition: form.condition,
        price: form.price ? parseFloat(form.price) : null,
        stock_quantity: form.stock_quantity ? Math.max(0, parseInt(form.stock_quantity)) : 1,
        city: form.city || null,
        photos: photoUrls,
      }).eq("id", id).eq("seller_id", user.id);
      if (error) throw error;

      // Delete removed photos from storage after successful DB update.
      const pathsToDelete = removedPhotos
        .map(extractStoragePath)
        .filter((p): p is string => !!p);
      if (pathsToDelete.length > 0) {
        const { error: rmErr } = await supabase.storage.from("part-photos").remove(pathsToDelete);
        if (rmErr) console.warn("[edit] eski fotoğraf silinemedi:", rmErr);
      }

      toast.success("İlan güncellendi.");
      nav({ to: "/account" });
    } catch (err: any) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("part-photos").remove(uploadedPaths).catch(() => {});
      }
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

        <StockInsightsCard partId={id} />

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold flex items-center justify-between">
            <span>Fotoğraflar (en az {MIN_PHOTOS}, en fazla {MAX_PHOTOS})</span>
            <span className={`text-[10px] ${items.length >= MIN_PHOTOS ? "text-emerald-400" : "text-muted-foreground"}`}>
              {items.length}/{MAX_PHOTOS}
            </span>
          </label>
          {items.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((it) => it.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-3 gap-2">
                  {items.map((it, i) => (
                    <SortablePhoto key={it.id} item={it} onRemove={() => removeItem(it)} isPrimary={i === 0} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          {items.length < MAX_PHOTOS && (
            <PhotoPicker onFiles={(fl) => addFiles(fl)} />
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Fotoğrafları sürükleyerek sırayı değiştirebilirsiniz. İlk fotoğraf <span className="text-gold font-semibold">kapak</span> olarak görüntülenir. JPG/PNG/WebP, en fazla 10MB.
          </p>
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

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wider text-gold font-semibold">OEM Numaraları *</label>
          <OemInput value={oemCodes} onChange={setOemCodes} required />
        </div>

        <Input placeholder="Motor Kodu" value={form.engine_code}
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
