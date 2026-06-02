import { useEffect, useState } from "react";
import { BadgeCheck, Clock, X as XIcon, ShieldCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  requestPhoneOtp,
  verifyPhoneOtp,
  getPhoneVerificationStatus,
} from "@/lib/phone-otp.functions";

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

function normalize(p: string) {
  return p.replace(/[\s()-]/g, "");
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

  // OTP state
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [testCode, setTestCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const reqOtp = useServerFn(requestPhoneOtp);
  const verOtp = useServerFn(verifyPhoneOtp);
  const getStatus = useServerFn(getPhoneVerificationStatus);

  const load = async () => {
    setLoading(true);
    const [verRes, statusRes] = await Promise.all([
      supabase.from("seller_verifications").select("*").eq("user_id", userId).maybeSingle(),
      getStatus(),
    ]);
    setV((verRes.data as Verification | null) ?? null);
    setVerifiedPhone(statusRes?.verifiedPhone ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [userId]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phoneNormalized = normalize(form.phone);
  const phoneIsVerified =
    !!verifiedPhone && !!phoneNormalized && verifiedPhone === phoneNormalized;

  const sendOtp = async () => {
    if (phoneNormalized.length < 7) {
      toast.error("Geçerli bir telefon numarası girin.");
      return;
    }
    setRequesting(true);
    try {
      const res = await reqOtp({ data: { phone: form.phone } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOtpSent(true);
      setCooldown(res.cooldownSeconds);
      setTestCode(res.testCode ?? null);
      toast.success(
        res.testCode
          ? `Test modu: kodun ${res.testCode}`
          : "Doğrulama kodu telefonuna gönderildi.",
      );
    } finally {
      setRequesting(false);
    }
  };

  const checkOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      toast.error("6 haneli kodu girin.");
      return;
    }
    setVerifying(true);
    try {
      const res = await verOtp({ data: { phone: form.phone, code: otpCode } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setVerifiedPhone(phoneNormalized);
      setOtpSent(false);
      setOtpCode("");
      setTestCode(null);
      toast.success("Telefon doğrulandı.");
    } finally {
      setVerifying(false);
    }
  };

  const submit = async () => {
    if (!phoneIsVerified) {
      toast.error("Önce telefon numaranı SMS kodu ile doğrulayın.");
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
      phone: phoneNormalized,
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
          Yöneticilerimiz en kısa sürede başvurunu değerlendirecek. Telefonun doğrulandı.
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
        Mavi tik almak için aşağıdaki bilgileri doldur. Başvuruyu göndermeden önce telefonunu SMS kodu ile doğrulaman gerekir.
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

      {/* Phone + OTP block */}
      <div className="space-y-2 p-3 rounded-lg border border-border bg-background/40">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Telefon (SMS ile doğrulanır)
          </label>
          {phoneIsVerified && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
              <ShieldCheck className="size-3.5" /> Doğrulandı
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="+90 5xx xxx xx xx"
            inputMode="tel"
            value={form.phone}
            disabled={phoneIsVerified}
            onChange={(e) => {
              setForm({ ...form, phone: e.target.value });
              setOtpSent(false);
              setOtpCode("");
              setTestCode(null);
            }}
            className="h-10 bg-background flex-1"
          />
          {!phoneIsVerified && (
            <Button
              type="button"
              onClick={sendOtp}
              disabled={requesting || cooldown > 0 || phoneNormalized.length < 7}
              variant="outline"
              className="h-10 px-3 shrink-0"
            >
              <Send className="size-3.5 mr-1" />
              {cooldown > 0 ? `${cooldown}s` : otpSent ? "Tekrar" : "Kod gönder"}
            </Button>
          )}
        </div>

        {otpSent && !phoneIsVerified && (
          <div className="space-y-2 pt-1">
            {testCode && (
              <p className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1">
                Test modu — SMS sağlayıcı yok. Kodun: <span className="font-mono font-bold">{testCode}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="6 haneli kod"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="h-10 bg-background flex-1 font-mono tracking-widest text-center"
              />
              <Button
                type="button"
                onClick={checkOtp}
                disabled={verifying || otpCode.length !== 6}
                className="h-10 px-3 shrink-0"
              >
                Doğrula
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Kod 5 dakika geçerlidir. En fazla 5 yanlış deneme yapılabilir.
            </p>
          </div>
        )}
      </div>

      <Textarea placeholder="Eklemek istediklerin (opsiyonel)" rows={3} value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-background" />
      <Button
        onClick={submit}
        disabled={saving || !phoneIsVerified}
        className="w-full bg-gold-gradient text-gold-foreground font-semibold disabled:opacity-50"
      >
        {saving
          ? "Gönderiliyor..."
          : phoneIsVerified
            ? "Doğrulama Başvurusu Gönder"
            : "Önce telefonu doğrulayın"}
      </Button>
    </div>
  );
}
