import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, MapPin, Calendar, Tag, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/parts/$id")({
  head: () => ({ meta: [{ title: "İlan Detayı — Taşıtsan" }] }),
  component: PartDetail,
});

interface PartFull {
  id: string; title: string; description: string | null;
  brand: string | null; model: string | null; year: number | null;
  category: string | null; condition: string; price: number | null;
  city: string | null; photos: string[]; whatsapp: string;
  seller_id: string; created_at: string;
}

function PartDetail() {
  const { id } = useParams({ from: "/parts/$id" });
  const [part, setPart] = useState<PartFull | null>(null);
  const [seller, setSeller] = useState<{ display_name: string | null } | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("parts").select("*").eq("id", id).maybeSingle();
      setPart(data as PartFull | null);
      if (data) {
        const { data: s } = await supabase.from("profiles").select("display_name").eq("id", data.seller_id).maybeSingle();
        setSeller(s);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Yükleniyor...</div>;
  if (!part) return (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div>
        <p className="text-muted-foreground">İlan bulunamadı.</p>
        <Link to="/" className="text-gold mt-3 inline-block">← Anasayfa</Link>
      </div>
    </div>
  );

  const waNumber = part.whatsapp.replace(/\D/g, "");
  const waMsg = encodeURIComponent(`Merhaba, Taşıtsan'daki "${part.title}" ilanınız için iletişime geçiyorum.`);
  const waUrl = `https://wa.me/${waNumber.startsWith("90") ? waNumber : `90${waNumber}`}?text=${waMsg}`;

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
          {part.city && <Info icon={<MapPin className="size-4" />} label="Şehir" value={part.city} />}
        </div>

        {part.description && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h2 className="text-xs uppercase tracking-wider text-gold mb-2">Açıklama</h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{part.description}</p>
          </div>
        )}

        <div className="bg-card rounded-xl p-4 border border-border flex items-center gap-3">
          <div className="size-11 rounded-full bg-gold-gradient grid place-items-center font-display text-lg text-gold-foreground">
            {(seller?.display_name ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Satıcı</div>
            <div className="font-semibold">{seller?.display_name ?? "İlan sahibi"}</div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border safe-bottom">
        <div className="max-w-md mx-auto p-3 flex gap-3">
          <a href={`tel:+${waNumber.startsWith("90") ? waNumber : `90${waNumber}`}`}
            className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-card border border-border text-foreground font-semibold text-sm active:scale-[0.98] transition-transform">
            <Phone className="size-5 text-gold" />
            Satıcıyı Ara
          </a>
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-whatsapp text-white font-semibold text-sm shadow-lg active:scale-[0.98] transition-transform">
            <MessageCircle className="size-5" />
            WhatsApp'tan Yaz
          </a>
        </div>
      </div>
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
