import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Siren, ArrowLeft, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { recordAiSearchConversion } from "@/lib/ai-search.functions";
import { trackEvent } from "@/lib/analytics";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  q:         fallback(z.string(), "").default(""),
  brand:     fallback(z.string(), "").default(""),
  model:     fallback(z.string(), "").default(""),
  year:      fallback(z.string(), "").default(""),
  part_name: fallback(z.string(), "").default(""),
  category:  fallback(z.string(), "").default(""),
  oem:       fallback(z.string(), "").default(""),
  src:       fallback(z.string(), "").default(""), // ai_search_logs.id — dönüşüm köprüsü
});

export const Route = createFileRoute("/urgent/new")({
  head: () => ({ meta: [{ title: "🚨 Acil Parça Talebi Oluştur — Taşıtsan" }, { name: "robots", content: "noindex,follow" }] }),
  validateSearch: zodValidator(searchSchema),
  component: NewUrgent,
});

const CATEGORIES = [
  "Motor", "Şanzıman", "Kaporta", "Elektrik", "Fren",
  "Süspansiyon", "Klima", "Yakıt Sistemi", "Aydınlatma", "Diğer",
];

function NewUrgent() {
  const { user } = useAuth();
  const nav = useNavigate();
  const search = Route.useSearch();
  const recordConv = useServerFn(recordAiSearchConversion);
  const [form, setForm] = useState({
    oem_code: (search.oem || "").toUpperCase().slice(0, 60),
    part_name: (search.part_name || search.q || "").slice(0, 120),
    brand: (search.brand || "").slice(0, 40),
    model: (search.model || "").slice(0, 40),
    year: (search.year || "").replace(/\D/g, "").slice(0, 4),
    city: "",
    category: CATEGORIES.includes(search.category) ? search.category : "",
    notes: search.q && search.q !== search.part_name ? `Arama: ${search.q}` : "",
    full_name: "",
    phone: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const prefilled = !!(search.q || search.brand || search.oem);

  useEffect(() => {
    if (search.src) {
      trackEvent("failed_search_to_request_open", { log_id: search.src, q: search.q });
    }
  }, [search.src, search.q]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Giriş yapmalısınız"); return; }
    if (!form.oem_code.trim()) { toast.error("OEM numarası zorunludur"); return; }
    if (!form.part_name.trim()) { toast.error("Parça adı zorunludur"); return; }
    if (!form.brand.trim() || !form.model.trim()) { toast.error("Araç marka/model zorunludur"); return; }
    if (!form.city.trim()) { toast.error("Şehir zorunludur"); return; }
    const fullName = form.full_name.trim();
    const phone = form.phone.trim();
    if (!fullName || !phone) { toast.error("Ad soyad ve telefon zorunludur"); return; }

    setSubmitting(true);
    const { error } = await supabase.from("part_requests").insert({
      buyer_id: user.id,
      is_urgent: true,
      part_name: form.part_name.trim(),
      search_query: form.part_name.trim(),
      oem_code: form.oem_code.trim().toUpperCase(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: form.year ? parseInt(form.year) : null,
      city: form.city.trim(),
      category: form.category || null,
      notes: form.notes.trim() || null,
      description: form.notes.trim() || null,
      message: `🚨 ACİL: ${form.part_name.trim()}`,
      full_name: fullName,
      phone,
      email: form.email.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      console.error("[urgent new] insert", error);
      toast.error(translateError(error));
      return;
    }
    // AI arama dönüşümünü işaretle
    if (search.src && /^[0-9a-f-]{36}$/i.test(search.src)) {
      recordConv({ data: { log_id: search.src, event: "request_created" } }).catch(() => {});
      trackEvent("failed_search_to_request_submitted", { log_id: search.src });
    }
    toast.success("🚨 Acil talebiniz tedarikçilere iletildi. Onaylı teklifler size ulaştırılacak.");
    nav({ to: "/urgent" });
  };


  if (!user) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader subtitle="Acil Talep" />
        <div className="max-w-md mx-auto px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground mb-3">Talep oluşturmak için giriş yapın.</p>
          <Link to="/auth" rel="nofollow" className="text-gold font-semibold">Giriş Yap →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <AppHeader subtitle="Acil Talep" />

      <div className="max-w-md mx-auto px-4 py-4">
        <button onClick={() => nav({ to: "/urgent" })}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gold mb-3">
          <ArrowLeft className="size-3.5" /> Geri
        </button>

        <div className="bg-gradient-to-br from-destructive/20 via-destructive/5 to-background border-2 border-destructive/50 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2">
            <Siren className="size-6 text-destructive animate-pulse" />
            <h1 className="font-display text-lg tracking-wide text-destructive">🚨 Acil Parça Talebi Oluştur</h1>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Talebiniz tedarikçilere anında iletilir. İletişim bilgileriniz gizli kalır — sadece Taşıtsan görür.
          </p>
        </div>

        {prefilled && (
          <div className="mb-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-3 flex items-start gap-2.5">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-primary mb-0.5">AI aramandan aktarıldı</div>
              <div className="text-muted-foreground">
                {search.q ? <>Arama: <b className="text-foreground">"{search.q}"</b>. </> : null}
                Alanları kontrol edip iletişim bilgilerini ekle, gönder.
              </div>
            </div>
          </div>
        )}



        <form onSubmit={submit} className="space-y-2.5">
          <Field label="OEM Numarası *">
            <Input value={form.oem_code} onChange={(e) => setForm({ ...form, oem_code: e.target.value.toUpperCase() })}
              maxLength={60} className="font-mono" placeholder="A2118200561" />
          </Field>
          <Field label="Parça Adı *">
            <Input value={form.part_name} onChange={(e) => setForm({ ...form, part_name: e.target.value })}
              maxLength={120} placeholder="Örn. ön sol far" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Araç Markası *">
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Model *">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} maxLength={40} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Model Yılı">
              <Input inputMode="numeric" value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </Field>
            <Field label="Kategori">
              <select value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Seçin</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Şehir *">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Notlar">
            <Textarea rows={3} maxLength={600} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Durum, motor kodu, ek detaylar..."
              className="resize-none" />
          </Field>

          <div className="pt-2 border-t border-border" />
          <p className="text-[10px] uppercase tracking-wider text-gold font-semibold">İletişim (gizli kalır)</p>
          <Field label="Ad Soyad *">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              maxLength={100} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefon *">
              <Input inputMode="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} />
            </Field>
            <Field label="E-posta">
              <Input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} />
            </Field>
          </div>

          <Button type="submit" disabled={submitting}
            className="w-full h-12 bg-gradient-to-r from-destructive to-destructive/80 text-white font-bold shadow-lg mt-3">
            {submitting ? "Gönderiliyor..." : "🚨 Acil Talebi Gönder"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gold font-semibold">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
