import { useEffect, useState } from "react";
import { BadgeCheck, Clock, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Verification {
  id: string;
  status: "pending" | "approved" | "rejected";
  account_type: "individual" | "business";
  company_name: string | null;
  tax_number: string | null;
  contact_person: string | null;
  city: string | null;
  phone: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

export function SellerVerification({ userId }: { userId: string }) {
  const [v, setV] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_type: "individual" as "individual" | "business",
    company_name: "",
    tax_number: "",
    contact_person: "",
    city: "",
    phone: "",
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("seller_verifications")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setV((data as Verification | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [userId]);

  const submit = async () => {
    if (!form.phone.trim() || form.phone.trim().length < 7) {
      toast.error("Telefon numarası gerekli.");
      return;
    }
    if (form.account_type === "business" && !form.company_name.trim()) {
      toast.error("Kurumsal başvuruda firma adı gerekli.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: userId,
      account_type: form.account_type,
      company_name: form.company_name.trim() || null,
      tax_number: form.tax_number.trim() || null,
      contact_person: form.contact_person.trim() || null,
      city: form.city.trim() || null,
      phone: form.phone.trim(),
      notes: form.notes.trim() || null,
      status: "pending" as const,
    };
    const { error } = await supabase
      .from("seller_verifications")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Başvurun alındı, en kısa sürede incelenecek.");
    void load();
  };

  if (loading) return <p className="text-xs text-muted-foreground">Yükleniyor...</p>;

  if (v && v.status === "approved") {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30">
        <BadgeCheck className="size-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-sky-300">Doğrulanmış Satıcı</div>
          <p className="text-[11px] text-muted-foreground">
            Hesabın doğrulandı. İlanlarında ve profilinde mavi tik gösterilir.
          </p>
        </div>
      </div>
    );
  }

  if (v && v.status === "pending") {
    return (
      <div className="space-y-2 p-3 rounded-lg bg-amber-400/10 border border-amber-400/40">
        <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
          <Clock className="size-4" /> Başvurun inceleniyor
        </div>
        <p className="text-[11px] text-muted-foreground">
          Yöneticilerimiz en kısa sürede başvurunu değerlendirecek.
        </p>
      </div>
    );
  }

  if (v && v.status === "rejected") {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/40">
          <div className="flex items-center gap-2 text-destructive text-sm font-semibold">
            <XIcon className="size-4" /> Başvurun reddedildi
          </div>
          {v.admin_notes && (
            <p className="text-[11px] text-muted-foreground mt-1">Açıklama: {v.admin_notes}</p>
          )}
        </div>
        <Button
          onClick={async () => {
            const { error } = await supabase
              .from("seller_verifications")
              .delete()
              .eq("user_id", userId);
            if (error) { toast.error(error.message); return; }
            void load();
          }}
          className="w-full"
          variant="outline"
        >
          Yeniden Başvur
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Mavi tik almak için aşağıdaki bilgileri doldur. Bireysel ya da kurumsal olarak başvurabilirsin.
      </p>
      <div className="flex gap-2">
        {(["individual", "business"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setForm({ ...form, account_type: t })}
            className={`flex-1 h-9 rounded-md text-xs font-semibold border transition ${
              form.account_type === t
                ? "bg-gold-gradient text-gold-foreground border-transparent"
                : "border-border text-muted-foreground"
            }`}
          >
            {t === "individual" ? "Bireysel" : "Kurumsal"}
          </button>
        ))}
      </div>
      {form.account_type === "business" && (
        <>
          <Input placeholder="Firma adı *" value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="h-10 bg-background" />
          <Input placeholder="Vergi numarası (opsiyonel)" value={form.tax_number}
            onChange={(e) => setForm({ ...form, tax_number: e.target.value })} className="h-10 bg-background" />
          <Input placeholder="Yetkili kişi" value={form.contact_person}
            onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="h-10 bg-background" />
        </>
      )}
      <Input placeholder="Şehir" value={form.city}
        onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-10 bg-background" />
      <Input placeholder="Telefon * (doğrulanacak)" inputMode="tel" value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 bg-background" />
      <Textarea placeholder="Eklemek istediklerin (opsiyonel)" rows={3} value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-background" />
      <Button onClick={submit} disabled={saving} className="w-full bg-gold-gradient text-gold-foreground font-semibold">
        {saving ? "Gönderiliyor..." : "Doğrulama Başvurusu Gönder"}
      </Button>
    </div>
  );
}
