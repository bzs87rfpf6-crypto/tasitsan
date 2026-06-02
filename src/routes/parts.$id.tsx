import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Send, MapPin, Calendar, Tag, ShieldCheck, ImageOff, Phone, MessageCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getSafePartPhotos } from "@/lib/part-images";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PartImageLightbox } from "@/components/PartImageLightbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { FavoriteButton } from "@/components/FavoriteButton";
import { recordPartView } from "@/lib/views";
import { EquivalentParts } from "@/components/EquivalentParts";
import { AiOemSuggester } from "@/components/AiOemSuggester";

export const Route = createFileRoute("/parts/$id")({
  loader: async ({ params }) => {
    try {
      const { getPartSeo } = await import("@/lib/seo.functions");
      return await getPartSeo({ data: { id: params.id } });
    } catch {
      return null;
    }
  },
  head: ({ params, loaderData }) => {
    const url = `https://tasitsan.com.tr/parts/${params.id}`;
    const p = loaderData;
    if (!p) {
      return {
        meta: [
          { title: "İlan — Taşıtsan Parça Borsası" },
          { property: "og:url", content: url },
        ],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const allOems = (p.oem_codes && p.oem_codes.length > 0 ? p.oem_codes : (p.oem_code ? [p.oem_code] : []));
    const primaryOem = allOems[0] ?? null;
    const oemListTxt = allOems.length > 0 ? allOems.join(", ") : null;
    const titleParts = [p.title, primaryOem, p.city].filter(Boolean).join(" • ");
    const seoTitle = `${titleParts} | Taşıtsan Parça Borsası`;
    const brandModel = [p.brand, p.model, p.year].filter(Boolean).join(" ");
    const priceTxt = p.price != null ? `${Number(p.price).toLocaleString("tr-TR")} ₺` : "Fiyat sorunuz";
    const desc = (p.description?.slice(0, 140) ??
      `${p.title}${brandModel ? ` — ${brandModel}` : ""}${oemListTxt ? `, OEM: ${oemListTxt}` : ""}${p.engine_code ? `, Motor: ${p.engine_code}` : ""}${p.city ? `, ${p.city}` : ""}. ${priceTxt}. Taşıtsan Parça Borsası üzerinden güvenle teklif alın.`)
      .replace(/\s+/g, " ").trim();
    const keywords = [...allOems, p.engine_code, p.brand, p.model, p.title].filter(Boolean).join(", ");
    const image = (p.photos ?? []).find((u) => typeof u === "string" && u.startsWith("http")) ?? null;
    const availability = (p.stock_quantity ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
    const condition =
      p.condition === "new" ? "https://schema.org/NewCondition" :
      p.condition === "refurbished" ? "https://schema.org/RefurbishedCondition" :
      "https://schema.org/UsedCondition";

    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.title,
      description: desc,
      sku: p.oem_code ?? p.id,
      mpn: p.oem_code ?? undefined,
      brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
      image: image ? [image] : undefined,
      itemCondition: condition,
      offers: {
        "@type": "Offer",
        url,
        priceCurrency: "TRY",
        price: p.price != null ? Number(p.price) : undefined,
        availability,
        seller: { "@type": "Organization", name: "Taşıtsan Parça Borsası" },
        areaServed: p.city ?? "TR",
      },
    };

    const meta: Array<Record<string, string>> = [
      { title: seoTitle },
      { name: "description", content: desc },
      { property: "og:title", content: seoTitle },
      { property: "og:description", content: desc },
      { property: "og:type", content: "product" },
      { property: "og:url", content: url },
      { name: "twitter:title", content: seoTitle },
      { name: "twitter:description", content: desc },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (image) {
      meta.push({ property: "og:image", content: image });
      meta.push({ name: "twitter:image", content: image });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
    };
  },
  component: PartDetail,
});

interface PartFull {
  id: string; title: string; description: string | null;
  brand: string | null; model: string | null; year: number | null;
  category: string | null; condition: string; price: number | null;
  city: string | null; photos: string[] | null;
  seller_id: string; created_at: string;
  oem_code: string | null; stock_quantity: number | null;
  oem_codes: string[] | null; engine_code: string | null;
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
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const [contactPhone, setContactPhone] = useState<string>("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("site_settings").select("contact_phone").maybeSingle()
      .then(({ data }) => setContactPhone(data?.contact_phone ?? ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setActivePhoto(0);
    setBrokenPhotos(new Set());
    (async () => {
      const { data, error } = await supabase
        .from("parts")
        .select("id,title,description,brand,model,year,category,condition,price,city,photos,seller_id,created_at,oem_code,oem_codes,engine_code,stock_quantity")
        .eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[part-detail] fetch failed:", error);
        toast.error("İlan yüklenemedi.");
      }
      setPart((data as PartFull | null) ?? null);
      setLoading(false);
      if (data) {
        trackEvent("part_view", { part_id: data.id, title: data.title, brand: data.brand, model: data.model });
        recordPartView(data.id, user?.id ?? null).then((c) => {
          if (!cancelled && c !== null) setViewCount(c);
        });
      }
    })();
    return () => { cancelled = true; };
  }, [id, user?.id]);

  // Defensive: filter null, non-string, unsupported and broken URLs; use Storage
  // render URLs so Safari decodes small optimized images instead of huge originals.
  const photos = useMemo(() => {
    const raw = Array.isArray(part?.photos) ? part!.photos : [];
    const filtered = getSafePartPhotos(raw, brokenPhotos, 960);
    if (raw.length !== filtered.length) {
      console.warn("[part-detail] filtered photos", {
        total: raw.length,
        kept: filtered.length,
        dropped: raw.filter((u) => !filtered.some((p) => p.original === u)),
      });
    }
    return filtered;
  }, [part, brokenPhotos]);

  // Clamp active index whenever the displayable list shrinks.
  useEffect(() => {
    if (activePhoto >= photos.length) setActivePhoto(0);
  }, [photos.length, activePhoto]);

  const markBroken = (photo: { original: string; display: string }) => {
    console.warn("[part-detail] image failed to load:", { original: photo.original, display: photo.display });
    setBrokenPhotos((prev) => {
      if (prev.has(photo.original) && prev.has(photo.display)) return prev;
      const next = new Set(prev);
      next.add(photo.original);
      next.add(photo.display);
      return next;
    });
  };


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
        {photos[activePhoto] ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="absolute inset-0 w-full h-full"
            aria-label="Fotoğrafı büyüt"
          >
            <img
              key={photos[activePhoto].display}
              src={photos[activePhoto].display}
              alt={part.title}
              loading="eager"
              decoding="async"
              onError={() => markBroken(photos[activePhoto])}
              className="w-full h-full object-cover"
            />
          </button>
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground flex-col gap-2">
            <ImageOff className="size-10" />
            <span className="text-xs">Bu ilan için görsel yok</span>
          </div>
        )}
        <Link to="/" className="absolute top-4 left-4 size-10 rounded-full bg-background/70 backdrop-blur grid place-items-center z-10">
          <ArrowLeft className="size-5" />
        </Link>
        {photos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
            {photos.map((_, i) => (
              <span key={i}
                className={`h-1.5 rounded-full transition-all ${i === activePhoto ? "w-6 bg-gold" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        )}
      </div>

      {lightboxOpen && photos.length > 0 && (
        <PartImageLightbox
          photos={photos}
          index={activePhoto}
          onIndexChange={setActivePhoto}
          onClose={() => setLightboxOpen(false)}
          onError={markBroken}
        />
      )}

      {photos.length > 1 && (
        <div className="flex gap-2 px-4 pt-3 overflow-x-auto">
          {photos.map((p, i) => (
            <button key={p.display} onClick={() => setActivePhoto(i)}
              className={`shrink-0 size-16 rounded-lg overflow-hidden border-2 ${i === activePhoto ? "border-gold" : "border-transparent"}`}>
              <img src={p.display} alt="" loading="lazy" decoding="async"
                onError={() => markBroken(p)}
                className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}


      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-block text-[10px] uppercase tracking-widest bg-gold/10 text-gold px-2 py-1 rounded border border-gold/30">
            {part.condition === "new" ? "Sıfır" : part.condition === "refurbished" ? "Yenilenmiş" : "İkinci El"}
          </span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border rounded-full px-3 py-1.5">
              <Eye className="size-3.5 text-gold" />
              {(viewCount ?? 0).toLocaleString("tr-TR")} Görüntülenme
            </span>
            <FavoriteButton partId={part.id} size="md" />
          </div>
        </div>
        <h1 className="font-display text-2xl tracking-wide leading-tight">{part.title}</h1>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="text-3xl font-display text-gold tracking-wider">
            {part.price != null ? `₺${Number(part.price).toLocaleString("tr-TR")}` : "Fiyat sor"}
          </div>
          {part.stock_quantity != null && (
            <div className="text-xs">
              <span className="text-muted-foreground">Stok: </span>
              <span className={`font-semibold ${part.stock_quantity > 0 ? "text-foreground" : "text-destructive"}`}>
                {part.stock_quantity > 0 ? `${part.stock_quantity} adet` : "Tükendi"}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          {(part.brand || part.model) && (
            <Info icon={<Tag className="size-4" />} label="Araç" value={[part.brand, part.model].filter(Boolean).join(" ")} />
          )}
          {part.year && <Info icon={<Calendar className="size-4" />} label="Yıl" value={String(part.year)} />}
          {part.category && <Info icon={<Tag className="size-4" />} label="Kategori" value={part.category} />}
          {part.city && <Info icon={<MapPin className="size-4" />} label="Bölge" value={part.city} />}
          {part.engine_code && <Info icon={<Tag className="size-4" />} label="Motor Kodu" value={part.engine_code} />}
        </div>

        {((part.oem_codes && part.oem_codes.length > 0) || part.oem_code) && (
          <div className="bg-card rounded-xl p-4 border border-border space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gold">OEM Numaraları</h2>
            <div className="flex flex-wrap gap-1.5">
              {(part.oem_codes && part.oem_codes.length > 0 ? part.oem_codes : [part.oem_code!]).map((code) => (
                <span key={code} className="font-mono text-xs px-2.5 py-1 rounded-md bg-background border border-gold/30 text-gold">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}

        {part.description && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h2 className="text-xs uppercase tracking-wider text-gold mb-2">Açıklama</h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{part.description}</p>
          </div>
        )}

        <EquivalentParts partId={part.id} />

        {part.oem_code && (
          <AiOemSuggester
            oem={part.oem_code}
            brand={part.brand}
            model={part.model}
            title={part.title}
          />
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
        <div className="max-w-md mx-auto p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <a href={contactPhone ? `tel:${contactPhone.replace(/\s/g, "")}` : undefined}
              onClick={(e) => {
                if (!contactPhone) { e.preventDefault(); toast.info("İletişim numarası yakında"); return; }
                trackEvent("click_call", { from: "part_detail", part_id: part.id });
              }}
              className="flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-border font-semibold text-sm active:scale-[0.98] transition-transform">
              <Phone className="size-4 text-gold" />
              Bizi Ara
            </a>
            <a href={contactPhone ? `https://wa.me/${contactPhone.replace(/\D/g, "")}` : undefined}
              target="_blank" rel="noopener noreferrer"
              onClick={(e) => {
                if (!contactPhone) { e.preventDefault(); toast.info("WhatsApp hattı yakında"); return; }
                trackEvent("click_whatsapp", { from: "part_detail", part_id: part.id });
              }}
              className="flex items-center justify-center gap-2 h-12 rounded-xl bg-card border border-border font-semibold text-sm active:scale-[0.98] transition-transform">
              <MessageCircle className="size-4 text-gold" />
              WhatsApp
            </a>
          </div>
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
