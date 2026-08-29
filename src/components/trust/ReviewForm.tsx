import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { StarRating } from "./StarRating";
import { submitReview } from "@/lib/trust.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  partId: string;
  sellerId: string;
  onSaved: () => void;
  onCancel: () => void;
  initial?: {
    rating?: number;
    title?: string;
    comment?: string;
    quality?: number;
    price?: number;
    communication?: number;
    shipping?: number;
    matchesDescription?: boolean | null;
    recommend?: boolean | null;
    images?: string[];
    reviewId?: string;
  };
}

export function ReviewForm({ partId, sellerId, onSaved, onCancel, initial }: Props) {
  const { user } = useAuth();
  const submit = useServerFn(submitReview);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [quality, setQuality] = useState(initial?.quality ?? 0);
  const [price, setPrice] = useState(initial?.price ?? 0);
  const [communication, setCommunication] = useState(initial?.communication ?? 0);
  const [shipping, setShipping] = useState(initial?.shipping ?? 0);
  const [matchesDescription, setMatches] = useState<boolean | null>(initial?.matchesDescription ?? null);
  const [recommend, setRecommend] = useState<boolean | null>(initial?.recommend ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const files = Array.from(e.target.files ?? []).slice(0, 4 - images.length);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name}: en fazla 5MB`); continue; }
        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `reviews/${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("part-photos").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) { toast.error(error.message); continue; }
        const { data } = supabase.storage.from("part-photos").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      setImages((prev) => [...prev, ...urls].slice(0, 4));
    } finally { setUploading(false); e.target.value = ""; }
  }

  async function save() {
    if (!rating) { toast.error("Genel puan seçin"); return; }
    setSaving(true);
    try {
      await submit({
        data: {
          reviewId: initial?.reviewId,
          partId, sellerId, rating,
          quality: quality || undefined,
          price: price || undefined,
          communication: communication || undefined,
          shipping: shipping || undefined,
          matchesDescription: matchesDescription ?? undefined,
          recommend: recommend ?? undefined,
          title: title || undefined,
          comment: comment || undefined,
          images,
        },
      });
      toast.success("Yorumunuz kaydedildi");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-gold/30 bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Yorumunu Paylaş</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Kapat">
          <X className="size-4" />
        </button>
      </div>

      <SubRow label="Genel Puan" value={rating} onChange={setRating} />
      <SubRow label="Ürün Kalitesi" value={quality} onChange={setQuality} />
      <SubRow label="Fiyat" value={price} onChange={setPrice} />
      <SubRow label="İletişim" value={communication} onChange={setCommunication} />
      <SubRow label="Kargo" value={shipping} onChange={setShipping} />

      <ToggleRow label="Ürün açıklamaya uygun muydu?" value={matchesDescription} onChange={setMatches} />
      <ToggleRow label="Bu satıcıyı tekrar tercih eder misiniz?" value={recommend} onChange={setRecommend} />

      <Input placeholder="Kısa başlık (isteğe bağlı)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="Deneyimini yaz (isteğe bağlı)" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Fotoğraf (en fazla 4)</label>
        <div className="flex gap-2 flex-wrap">
          {images.map((src) => (
            <div key={src} className="relative size-16 rounded overflow-hidden border border-border">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setImages(images.filter((s) => s !== src))}
                className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/70 text-white text-[10px] leading-none">×</button>
            </div>
          ))}
          {images.length < 4 && (
            <label className="size-16 rounded border border-dashed border-border grid place-items-center text-xs text-muted-foreground cursor-pointer hover:border-gold">
              {uploading ? "…" : "+ Ekle"}
              <input type="file" accept="image/*" multiple hidden onChange={upload} />
            </label>
          )}
        </div>
      </div>

      <Button onClick={save} disabled={saving || !rating}
        className="w-full h-11 bg-gold-gradient text-gold-foreground font-semibold shadow-gold">
        {saving ? "Kaydediliyor…" : initial?.reviewId ? "Güncelle" : "Yorumu Gönder"}
      </Button>
    </div>
  );
}

function SubRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <StarRating value={value} size={20} interactive onChange={onChange} />
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        <button type="button" onClick={() => onChange(true)}
          className={`h-7 px-3 rounded-md text-[11px] font-semibold border ${value === true ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/40" : "border-border text-muted-foreground"}`}>
          Evet
        </button>
        <button type="button" onClick={() => onChange(false)}
          className={`h-7 px-3 rounded-md text-[11px] font-semibold border ${value === false ? "bg-destructive/20 text-destructive border-destructive/40" : "border-border text-muted-foreground"}`}>
          Hayır
        </button>
      </div>
    </div>
  );
}
