import { Camera, MessageCircle, PackageSearch, ShieldCheck, Info } from "lucide-react";

interface Props {
  whatsappNumber?: string | null;
  phoneNumber?: string | null;
  onRequestMessage?: () => void;
  title?: string;
  price?: number | null;
  className?: string;
}

const TRUST_ITEMS = [
  "Stok Doğrulaması Yapılır",
  "Güncel Fotoğraf Talep Edilebilir",
  "Güvenli Alışveriş",
  "Sipariş Öncesi Kontrol",
];

/**
 * Görseli olmayan (tedarikçi/servis stoğu) ürünler için bilgi kartı.
 */
export function NoImageCard({
  whatsappNumber,
  onRequestMessage,
  title,
  price,
  className = "",
}: Props) {
  const waDigits = (whatsappNumber ?? "").replace(/\D/g, "");
  const photoHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Merhaba, "${title ?? "ilan"}" için güncel fotoğraf rica ediyorum.`)}`
    : null;
  const askHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Merhaba, "${title ?? "ilan"}" hakkında bilgi almak istiyorum.`)}`
    : null;

  const lowPrice = price != null && Number(price) > 0 && Number(price) < 1000;

  const btnPrimary =
    "inline-flex items-center justify-center gap-1.5 rounded-xl bg-gold-gradient text-gold-foreground font-semibold text-sm h-11 px-4 shadow-gold hover:opacity-95";
  const btnGhost =
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-gold/40 bg-background/60 text-foreground font-semibold text-sm h-11 px-4 hover:border-gold";

  return (
    <div
      className={`relative w-full h-full min-h-[260px] bg-gradient-to-br from-card via-background to-card border border-gold/20 rounded-2xl overflow-y-auto flex items-center justify-center p-5 sm:p-6 ${className}`}
    >
      <div className="absolute inset-0 opacity-[0.05] bg-[radial-gradient(circle_at_30%_20%,var(--gold)_0%,transparent_55%)] pointer-events-none" />
      <div className="relative w-full max-w-md text-center space-y-4">
        <div className="mx-auto size-14 rounded-full bg-gold/10 border border-gold/30 grid place-items-center">
          <PackageSearch className="size-6 text-gold" />
        </div>

        <div className="space-y-1.5">
          <h3 className="font-display text-base sm:text-lg tracking-wide text-foreground">
            📦 Bu ürün tedarikçi stoğundadır.
          </h3>
          <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
            Bu ürün anlaşmalı servis veya tedarikçi stoğunda bulunmaktadır.
            Siparişinizden önce güncel fotoğrafı ve stok durumu tarafımızca doğrulanır.
          </p>
        </div>

        {lowPrice && (
          <div className="text-left rounded-xl border border-gold/25 bg-gold/[0.06] p-3 flex gap-2">
            <Info className="size-4 text-gold shrink-0 mt-0.5" />
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
              Bu ürünün fiyatı 1000 TL'nin altındadır. İki aşamalı kargo süreci nedeniyle tek başına
              gönderimi ekonomik olmayabilir. Aynı satıcıdan farklı ürünler ekleyerek daha avantajlı
              sipariş oluşturabilirsiniz.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-left">
          {TRUST_ITEMS.map((t) => (
            <div
              key={t}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5"
            >
              <ShieldCheck className="size-3.5 text-gold shrink-0" />
              <span className="text-[11px] text-muted-foreground leading-tight">{t}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch justify-center gap-2 pt-1">
          {photoHref ? (
            <a href={photoHref} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              <Camera className="size-4" /> 📷 Güncel Fotoğraf İste
            </a>
          ) : onRequestMessage ? (
            <button type="button" onClick={onRequestMessage} className={btnPrimary}>
              <Camera className="size-4" /> 📷 Güncel Fotoğraf İste
            </button>
          ) : null}

          {askHref ? (
            <a href={askHref} target="_blank" rel="noopener noreferrer" className={btnGhost}>
              <MessageCircle className="size-4 text-gold" /> 💬 Satıcıya Soru Sor
            </a>
          ) : onRequestMessage ? (
            <button type="button" onClick={onRequestMessage} className={btnGhost}>
              <MessageCircle className="size-4 text-gold" /> 💬 Satıcıya Soru Sor
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
