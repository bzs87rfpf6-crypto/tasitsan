import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, FileText, MapPin, Package, HandCoins, ShieldCheck, BadgeCheck, CircleDot, Building2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { getPublicStok, submitStokOffer, type PublicStokDetail } from "@/lib/stok-public.functions";

const SITE_URL = "https://www.tasitsan.com.tr";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["stok", "public", "detail", id],
    queryFn: () => getPublicStok({ data: { id } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/stok/$id")({
  loader: async ({ params, context }) => {
    const d = await context.queryClient.ensureQueryData(detailQuery(params.id));
    if (!d) throw notFound();
    return d;
  },
  head: ({ params, loaderData }) => {
    const d = loaderData as PublicStokDetail | undefined;
    const title = d?.title ? `${d.title} — Stok Borsası` : "Stok ilanı";
    const desc = d?.description?.slice(0, 160)
      ?? `${d?.estimated_item_count ?? "—"} parça, ${d?.city ?? "Türkiye"} — Taşıtsan Stok Borsası`;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: `${SITE_URL}/stok/${params.id}` },
      { property: "og:type", content: "product" },
    ];
    if (d?.cover_image) {
      meta.push({ property: "og:image", content: d.cover_image });
      meta.push({ name: "twitter:image", content: d.cover_image });
    }
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: d?.title ?? "Stok ilanı",
      description: desc,
      ...(d?.cover_image ? { image: d.cover_image } : {}),
      ...(d?.expected_price != null
        ? {
            offers: {
              "@type": "Offer",
              priceCurrency: "TRY",
              price: d.expected_price,
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/stok/${params.id}`,
            },
          }
        : {}),
    };
    return {
      meta,
      links: [{ rel: "canonical", href: `${SITE_URL}/stok/${params.id}` }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
    };
  },
  errorComponent: ({ error }) => {
    console.error("[stok-detay] load failed", error);
    return <p className="p-6 text-center text-sm text-muted-foreground">İlan şu anda yüklenemedi. Lütfen sayfayı yenileyin.</p>;
  },

  notFoundComponent: () => (
    <div className="min-h-dvh bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-3 py-10 text-center">
        <p className="text-sm">İlan bulunamadı veya yayından kaldırılmış.</p>
        <Link to="/stok" className="inline-block mt-3 text-gold underline text-sm">Stok Borsasına dön</Link>
      </main>
      <BottomNav />
    </div>
  ),
  component: StokDetailPage,
});

function StokDetailPage() {
  const { id } = Route.useParams();
  const { data: l } = useSuspenseQuery(detailQuery(id));
  if (!l) return null;
  return <DetailView l={l} />;
}

function DetailView({ l }: { l: PublicStokDetail }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<string>(l.expected_price ? String(l.expected_price) : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; note?: string }>({});
  
  const submitFn = useServerFn(submitStokOffer);
  const m = useMutation({
    mutationFn: () => {
      const parsedAmount = Number(amount.replace(",", "."));
      return submitFn({ data: { listingId: l.id, amount: parsedAmount, note: note || null } });
    },
    onSuccess: () => {
      toast.success("Teklifiniz ve mesajınız başarıyla satıcıya iletildi!");
      setNote("");
      setErrors({});
    },
    onError: (e: Error) => {
      toast.error(e.message || "Teklif gönderilirken bir hata oluştu.");
    },
  });

  const canOffer = !!user;

  return (
    <div className="min-h-dvh bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-3 py-3 space-y-3">
        <Link to="/stok" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
          <ChevronLeft className="size-3" /> Stok Borsası
        </Link>

        <header className="space-y-2">
          <h1 className="text-xl font-bold">{l.title}</h1>
          <div className="flex flex-wrap gap-1">
            {l.status === "offer_collecting" && <Pill cls="text-sky-300 border-sky-400/40 bg-sky-400/10"><CircleDot className="size-3" /> Teklif Topluyor</Pill>}
            {l.status === "active" && <Pill cls="text-emerald-300 border-emerald-400/40 bg-emerald-400/10"><CircleDot className="size-3" /> Yayında</Pill>}
            {l.expert_completed && <Pill cls="text-emerald-300 border-emerald-400/40 bg-emerald-400/10"><ShieldCheck className="size-3" /> Taşıtsan Onaylı Stok</Pill>}
            {l.expert_requested && !l.expert_completed && <Pill cls="text-amber-300 border-amber-400/40 bg-amber-400/10"><CircleDot className="size-3" /> Ekspertiz Bekliyor</Pill>}
          </div>
          <p className="text-[12px] text-muted-foreground flex items-center gap-2">
            {l.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {l.city}</span>}
            <span>· {new Date(l.created_at).toLocaleDateString("tr-TR")}</span>
          </p>
        </header>

        {l.images.length > 0 && (
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {l.images.map((img, i) => (
              <a key={i} href={img.url} target="_blank" rel="noopener" className="block">
                <img src={img.url} alt={img.name} loading="lazy"
                  className="w-full aspect-square object-cover rounded-lg border border-border" />
              </a>
            ))}
          </section>
        )}

        <section className="bg-card border border-border rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Stat label="Beklenen Fiyat" value={l.expected_price != null ? `₺${Number(l.expected_price).toLocaleString("tr-TR")}` : "—"} />
          <Stat label="Parça Adedi" value={l.estimated_item_count?.toLocaleString("tr-TR") ?? "—"} />
          <Stat label="OEM Sayısı" value={l.estimated_oem_count?.toLocaleString("tr-TR") ?? "—"} />
          <Stat label="Satış Durumu" value={l.status === "offer_collecting" ? "Teklif" : "Yayında"} />
        </section>

        {l.description && (
          <section className="bg-card border border-border rounded-xl p-3">
            <h2 className="font-semibold text-sm mb-1">Açıklama</h2>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{l.description}</p>
          </section>
        )}

        {l.files.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-3 space-y-2">
            <h2 className="font-semibold text-sm">Dosyalar ({l.files.length})</h2>
            <div className="flex flex-wrap gap-1">
              {l.files.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener"
                  className="inline-flex items-center gap-1 text-xs bg-background/60 border border-border rounded px-2 py-1 hover:border-gold">
                  <FileText className="size-3" /> {f.name}
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="bg-card border border-border rounded-xl p-3 space-y-1">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Building2 className="size-4" /> Satıcı
          </h2>
          <p className="text-sm">{l.seller.company_name ?? "Taşıtsan üyesi"}</p>
          <div className="flex flex-wrap gap-1 pt-1">
            {l.seller.is_verified && <Pill cls="text-gold border-gold/40 bg-gold/10"><BadgeCheck className="size-3" /> Taşıtsan Onaylı Satıcı</Pill>}
            {l.seller.city && <Pill cls="text-muted-foreground border-border bg-background/40"><MapPin className="size-3" /> {l.seller.city}</Pill>}
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Telefon ve e-posta bilgileri gizlidir. İletişim için teklif gönderin; satıcı kabul ettiğinde iletişim açılır.
          </p>
        </section>

        <section className="bg-card border border-border rounded-xl p-3 space-y-2">
          <h2 className="font-semibold text-sm flex items-center gap-2"><HandCoins className="size-4" /> Teklif Ver & Mesaj Ekle</h2>
          {!canOffer ? (
            <p className="text-xs text-muted-foreground">
              Teklif vermek veya mesaj eklemek için <Link to="/auth" rel="nofollow" className="text-gold underline">giriş yapın</Link>.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium flex justify-between">
                  <span>Teklif tutarı (₺)</span>
                  {l.expected_price != null && (
                    <span className="text-[10px] text-gold">
                      Beklenen: ₺{Number(l.expected_price).toLocaleString("tr-TR")}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  disabled={m.isPending}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow numbers, comma, dot
                    if (/^[0-9.,]*$/.test(val)) {
                      setAmount(val);
                    }
                    if (errors.amount) {
                      setErrors((prev) => ({ ...prev, amount: undefined }));
                    }
                  }}
                  placeholder="Tutar girin"
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${
                    errors.amount 
                      ? "border-destructive focus:ring-destructive" 
                      : "border-border focus:ring-gold"
                  } disabled:opacity-50`}
                />
                {errors.amount && (
                  <p className="text-destructive text-[11px] font-medium mt-0.5">{errors.amount}</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-muted-foreground font-medium">Mesaj (opsiyonel)</label>
                  <span className={`text-[10px] ${note.length > 1000 ? "text-destructive" : "text-muted-foreground"}`}>
                    {note.length}/1000
                  </span>
                </div>
                <textarea
                  value={note}
                  disabled={m.isPending}
                  onChange={(e) => {
                    setNote(e.target.value);
                    if (errors.note) {
                      setErrors((prev) => ({ ...prev, note: undefined }));
                    }
                  }}
                  rows={3}
                  placeholder="Satıcıya iletmek istediğiniz özel mesajı buraya yazabilirsiniz..."
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-sm transition-all focus:outline-none focus:ring-1 resize-none ${
                    errors.note 
                      ? "border-destructive focus:ring-destructive" 
                      : "border-border focus:ring-gold"
                  } disabled:opacity-50`}
                />
                {errors.note && (
                  <p className="text-destructive text-[11px] font-medium mt-0.5">{errors.note}</p>
                )}
              </div>

              <button
                onClick={() => {
                  if (m.isPending) return;
                  
                  const newErrors: { amount?: string; note?: string } = {};
                  const cleanAmount = amount.trim().replace(",", ".");
                  const n = Number(cleanAmount);
                  
                  if (!cleanAmount) {
                    newErrors.amount = "Lütfen teklif tutarı giriniz.";
                  } else if (!Number.isFinite(n) || n <= 0) {
                    newErrors.amount = "Geçerli ve 0'dan büyük bir teklif tutarı giriniz.";
                  } else if (n > 1_000_000_000) {
                    newErrors.amount = "Maksimum teklif tutarı ₺1.000.000.000 olabilir.";
                  }

                  if (note.length > 1000) {
                    newErrors.note = "Mesajınız en fazla 1000 karakter olabilir.";
                  }

                  if (Object.keys(newErrors).length > 0) {
                    setErrors(newErrors);
                    toast.error("Lütfen formdaki hataları kontrol ediniz.");
                    return;
                  }

                  m.mutate();
                }}
                disabled={m.isPending}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-gold text-background font-semibold text-sm px-3 py-2.5 rounded-lg transition-all hover:bg-gold/90 disabled:opacity-50 active:scale-[0.98]"
              >
                {m.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Gönderiliyor...
                  </>
                ) : (
                  <>
                    <HandCoins className="size-4" />
                    Teklifi & Mesajı Gönder
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 border border-border/60 rounded p-2">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-bold flex items-center justify-center gap-1"><Package className="size-3 opacity-60" /> {value}</p>
    </div>
  );
}

function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] border rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}
