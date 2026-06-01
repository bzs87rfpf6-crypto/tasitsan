import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Send, MapPin, Calendar, Tag, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/parts/$id")({
  head: () => ({ meta: [{ title: "İlan Detayı — Taşıtsan" }] }),
  component: PartDetail,
});

interface PartFull {
  id: string; title: string; description: string | null;
  brand: string | null; model: string | null; year: number | null;
  category: string | null; condition: string; price: number | null;
  city: string | null; photos: string[];
  seller_id: string; created_at: string;
}

function PartDetail() {
  const { id } = useParams({ from: "/parts/$id" });
  const { user } = useAuth();
  const nav = useNavigate();
  const [part, setPart] = useState<PartFull | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", message: "" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("parts")
        .select("id,title,description,brand,model,year,category,condition,price,city,photos,seller_id,created_at")
        .eq("id", id).maybeSingle();
      setPart(data as PartFull | null);
      setLoading(false);
    })();
  }, [id]);

  const openForm = () => {
    if (!user) {
      toast.info("Talep oluşturmak için giriş yapmalısın");
      nav({ to: "/auth" });
      return;
    }
    setForm((f) => ({ ...f, message: f.message || `"${part?.title}" ilanı hakkında bilgi almak istiyorum.` }));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !part) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("inquiries").insert({
        part_id: part.id,
        buyer_id: user.id,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        message: form.message.trim(),
      });
      if (error) throw error;
      toast.success("Teklif talebin alındı! Taşıtsan en kısa sürede seninle iletişime geçecek.");
      setOpen(false);
      setForm({ full_name: "", phone: "", email: "", message: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Talep gönderilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  if (!part) return (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div>
        <p className="text-muted-foreground">İlan bulunamadı.</p>
        <Link to="/" className="text-gold mt-3 inline-block">← Anasayfa</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-32">
      <div className="relative bg-secondary aspect-square">
        {part.photos[activePhoto] ? (
          <img src={part.photos[activePhoto]} alt={part.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">Fotoğraf yok</div>
        )}
        <Link to="/" className="absolute top-4 left-4 size-10 rounded-full bg-background/70 backdrop-blur grid place-items-center">
          <ArrowLeft className="size-5" />
        </Link>
        {part.photos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {part.photos.map((_, i) => (
              <button key={i} onClick={() => setActivePhoto(i)}
                className={`h-1.5 rounded-full transition-all ${i === activePhoto ? "w-6 bg-gold" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        )}
      </div>

      {part.photos.length > 1 && (
        <div className="flex gap-2 px-4 pt-3 overflow-x-auto">
          {part.photos.map((p, i) => (
            <button key={i} onClick={() => setActivePhoto(i)}
              className={`shrink-0 size-16 rounded-lg overflow-hidden border-2 ${i === activePhoto ? "border-gold" : "border-transparent"}`}>
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <span className="inline-block text-[10px] uppercase tracking-widest bg-gold/10 text-gold px-2 py-1 rounded border border-gold/30">
          {part.condition === "new" ? "Sıfır" : part.condition === "refurbished" ? "Yenilenmiş" : "İkinci El"}
        </span>
        <h1 className="font-display text-2xl tracking-wide leading-tight">{part.title}</h1>
        <div className="text-3xl font-display text-gold tracking-wider">
          {part.price != null ? `₺${Number(part.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {(part.brand || part.model) && (
            <Info icon={<Tag className="size-4" />} label="Araç" value={[part.brand, part.model].filter(Boolean).join(" ")} />
          )}
          {part.year && <Info icon={<Calendar className="size-4" />} label="Yıl" value={String(part.year)} />}
          {part.category && <Info icon={<Tag className="size-4" />} label="Kategori" value={part.category} />}
          {part.city && <Info icon={<MapPin className="size-4" />} label="Bölge" value={part.city} />}
          
        </div>

        {part.description && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h2 className="text-xs uppercase tracking-wider text-gold mb-2">Açıklama</h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{part.description}</p>
          </div>
        )}

        <div className="bg-card rounded-xl p-4 border border-gold/30 flex gap-3">
          <ShieldCheck className="size-5 text-gold shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Güvenli ticaret ve doğru eşleştirme için tüm talepler{" "}
            <span className="text-gold font-semibold">Taşıtsan</span> aracılığıyla yönetilmektedir.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border safe-bottom">
        <div className="max-w-md mx-auto p-3">
          <button onClick={openForm}
            className="w-full flex items-center justify-center gap-2 h-14 rounded-xl bg-gold-gradient text-gold-foreground font-semibold text-sm shadow-gold active:scale-[0.98] transition-transform">
            <Send className="size-5" />
            Teklif Talebi Gönder
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display tracking-wide">Teklif Talebi</DialogTitle>
            <DialogDescription className="text-xs">
              Bilgilerin sadece Taşıtsan ekibine iletilir. Satıcıyla doğrudan paylaşılmaz.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <Input placeholder="Ad Soyad" required maxLength={100} value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-11" />
            <Input placeholder="Telefon Numarası" required maxLength={20} inputMode="tel" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11" />
            <Input type="email" placeholder="E-posta" required maxLength={150} value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" />
            <Textarea placeholder="Mesajınız" required maxLength={1000} rows={4} value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })} className="resize-none" />
            <Button type="submit" disabled={submitting}
              className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
              {submitting ? "Gönderiliyor..." : "Talebi Gönder"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg p-3 border border-border">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        <span className="text-gold">{icon}</span>{label}
      </div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );
}
