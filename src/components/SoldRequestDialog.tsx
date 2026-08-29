// Satılan üründen talep oluşturma: ürün bilgileri otomatik dolu gelir,
// kullanıcıdan yalnızca adet, telefon ve açıklama istenir.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export interface SoldRequestPart {
  id: string;
  title: string;
  oem_code?: string | null;
  oem_codes?: string[] | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  category?: string | null;
  city?: string | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

export function SoldRequestDialog({
  open, onOpenChange, part,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  part: SoldRequestPart;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const oem = part.oem_code ?? (part.oem_codes && part.oem_codes[0]) ?? null;
  const vehicle = [part.brand, part.model].filter(Boolean).join(" ") || "—";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = data.user ?? null;
      setUserId(u?.id ?? null);
      if (!u) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name,whatsapp")
        .eq("id", u.id)
        .maybeSingle();
      if (cancelled || !p) return;
      setFullName((v) => v || p.display_name || "");
      setPhone((v) => v || p.whatsapp || "");
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      toast.error("Talep oluşturmak için giriş yapmalısınız.");
      window.location.href = `/auth?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const qty = Math.max(1, Math.min(999, parseInt(quantity || "1", 10) || 1));
    if (!phone.trim() || phone.trim().length < 7) {
      toast.error("Geçerli bir telefon numarası girin.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("part_requests").insert({
        buyer_id: userId,
        full_name: fullName.trim() || "Taşıtsan Kullanıcısı",
        phone: phone.trim(),
        part_name: part.title,
        search_query: part.title,
        oem_code: oem,
        brand: part.brand ?? null,
        model: part.model ?? null,
        year: part.year ?? null,
        category: part.category ?? null,
        city: part.city ?? null,
        quantity: qty,
        source_part_id: part.id,
        description: description.trim() || null,
        message: description.trim() || `Satılan ilan için talep: ${part.title}`,
      } as never);
      if (error) throw error;
      toast.success(
        "Talebiniz başarıyla oluşturuldu. Aynı OEM numarasına sahip ürün sisteme eklendiğinde size bildirim gönderilecektir.",
        { duration: 8000 },
      );
      setDescription("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Talep oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">Talep Oluştur</DialogTitle>
          <DialogDescription className="text-xs">
            Bu ürün satılmış. Talep bırakın; aynı OEM numarasıyla yeni ilan geldiğinde bildirim gönderelim.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-background/60 px-3 py-2">
          <Row label="OEM No" value={oem ?? "—"} />
          <Row label="Ürün Adı" value={part.title} />
          <Row label="Marka" value={part.brand ?? "—"} />
          <Row label="Araç" value={vehicle} />
          <Row label="Model Yılı" value={part.year ? String(part.year) : "—"} />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Adet</label>
              <Input type="number" min={1} max={999} value={quantity}
                onChange={(e) => setQuantity(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Telefon</label>
              <Input inputMode="tel" maxLength={20} required placeholder="05xx xxx xx xx"
                value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Açıklama</label>
            <Textarea rows={3} maxLength={1000} placeholder="Ek bilgi (opsiyonel)"
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-600/90 text-white font-semibold">
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Talebi Gönder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
