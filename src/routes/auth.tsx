import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { checkAuthLockout, recordAuthFailure, clearAuthFailures, checkRateLimit } from "@/lib/security.functions";
import { executeRecaptcha } from "@/lib/recaptcha";
import { verifyRecaptcha } from "@/lib/recaptcha.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Giriş — Taşıtsan" }] }),
  component: AuthPage,
});

// Auth requires an email under the hood. We synthesize a stable identifier
// from the phone number so users can sign up & log in with phone only.
const PHONE_DOMAIN = "phone.tasitsan.local";

function normalizePhone(raw: string): string {
  // Keep digits only. Drop leading 0 / 90 country prefix when present.
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d;
}

function phoneToAuthEmail(phone: string): string {
  return `${normalizePhone(phone)}@${PHONE_DOMAIN}`;
}

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [phone, setPhone] = useState("");
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const lockoutCheck = useServerFn(checkAuthLockout);
  const recordFailure = useServerFn(recordAuthFailure);
  const clearFailures = useServerFn(clearAuthFailures);
  const rateLimit = useServerFn(checkRateLimit);


  const sendReset = async () => {
    const target = email.trim();
    if (!target) {
      toast.error("Şifre sıfırlama için kayıtlı e-posta adresini gir. E-postan yoksa yöneticiyle iletişime geç.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Sıfırlama bağlantısı e-postana gönderildi.");
      setMode("login");
    } catch (err: any) {
      toast.error(err.message ?? "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Şifre en az 6 karakter olmalı.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const digits = normalizePhone(phone);
        if (digits.length < 10) {
          toast.error("Geçerli bir telefon numarası gir (10 hane).");
          setLoading(false);
          return;
        }
        if (!name.trim()) {
          toast.error("Ad-Soyad veya firma adı zorunlu.");
          setLoading(false);
          return;
        }

        // Rate limit signup attempts per IP (5 / 10 minutes)
        const rl = await rateLimit({
          data: { action: "signup", max: 5, windowSeconds: 600, scope: "ip" },
        });
        if (!rl.allowed) {
          toast.error(`Çok fazla kayıt denemesi. ${rl.retry_after_seconds} sn sonra tekrar dene.`);
          setLoading(false);
          return;
        }

        const authEmail = phoneToAuthEmail(digits);
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            data: {
              display_name: name.trim(),
              whatsapp: digits,
              contact_email: email.trim() || null,
            },
          },
        });
        if (error) throw error;
        toast.success(
          "Kayıt alındı. Hesabın yönetici onayına gönderildi — onaylandığında ilan verebilirsin.",
          { duration: 6000 },
        );
        if (data.session) nav({ to: "/" });
        else setMode("login");
      } else {
        // Login: accept either an email or a phone number.
        const raw = loginId.trim();
        if (!raw) {
          toast.error("Telefon veya e-posta adresi gir.");
          setLoading(false);
          return;
        }
        const isEmail = raw.includes("@");
        let authEmail: string;
        if (isEmail) {
          authEmail = raw.toLowerCase();
        } else {
          const digits = normalizePhone(raw);
          if (digits.length < 10) {
            toast.error("Geçerli bir telefon numarası veya e-posta gir.");
            setLoading(false);
            return;
          }
          authEmail = phoneToAuthEmail(digits);
        }

        // Lockout check: 5+ failed attempts within 15 min for this identifier
        const lock = await lockoutCheck({ data: { identifier: authEmail } });
        if (lock.locked) {
          toast.error("Hesap geçici olarak kilitlendi. 15 dakika sonra tekrar dene.");
          setLoading(false);
          return;
        }

        // Rate limit login attempts per IP (10 / minute)
        const rl = await rateLimit({
          data: { action: "login", max: 10, windowSeconds: 60, scope: "ip" },
        });
        if (!rl.allowed) {
          toast.error(`Çok fazla deneme. ${rl.retry_after_seconds} sn bekle.`);
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (error) {
          // Record failure for lockout tracking
          recordFailure({ data: { identifier: authEmail, kind: isEmail ? "email" : "phone" } }).catch(() => {});
          throw error;
        }
        // Successful login — clear failure counter
        clearFailures({ data: { identifier: authEmail } }).catch(() => {});
        toast.success("Hoş geldin!");
        nav({ to: "/" });
      }
    } catch (err: any) {
      const msg = err?.message ?? "Bir hata oluştu";
      if (mode === "login" && /invalid/i.test(msg)) {
        toast.error("Telefon/e-posta veya şifre hatalı.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen">
      <AppHeader subtitle={mode === "login" ? "Giriş Yap" : mode === "signup" ? "Kayıt Ol" : "Şifre Sıfırla"} />
      <div className="max-w-md mx-auto px-4 pt-8 pb-12">
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl text-gold">
            {mode === "login" ? "TEKRAR HOŞ GELDİN" : mode === "signup" ? "ARAMIZA KATIL" : "ŞİFREMİ UNUTTUM"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "signup"
              ? "Telefon numaranla saniyeler içinde kayıt ol. Hesabın onaylandığında ilan verebilirsin."
              : mode === "login"
              ? "Telefon numaran veya e-postan ile giriş yap."
              : "E-postan varsa sıfırlama bağlantısı gönderelim."}
          </p>
        </div>

        {mode === "signup" && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed mb-4">
            <span className="text-gold font-semibold">Onay süreci:</span> Yeni hesaplar Taşıtsan ekibi tarafından
            incelenir. Onaydan sonra ilan vermeye başlayabilirsin.
          </div>
        )}

        {mode === "forgot" ? (
          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Kayıtlı e-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-card"
            />
            <Button onClick={sendReset} disabled={loading} className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
              {loading ? "..." : "Sıfırlama Bağlantısı Gönder"}
            </Button>
            <button type="button" onClick={() => setMode("login")} className="w-full text-sm text-muted-foreground">
              ← Girişe dön
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Input
                placeholder="Ad-Soyad veya firma adı"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                className="h-12 bg-card"
              />
            )}
            {mode === "signup" ? (
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="Telefon (5xx xxx xx xx)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="h-12 bg-card"
              />
            ) : (
              <Input
                type="text"
                placeholder="Telefon veya e-posta"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                autoComplete="username"
                className="h-12 bg-card"
              />
            )}
            {mode === "signup" && (
              <Input
                type="email"
                placeholder="E-posta (isteğe bağlı)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-card"
              />
            )}
            <Input
              type="password"
              placeholder="Şifre (en az 6 karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-12 bg-card"
            />
            <Button type="submit" disabled={loading} className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
              {loading ? "..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
            </Button>
          </form>
        )}

        {mode === "login" && (
          <button
            type="button"
            onClick={() => setMode("forgot")}
            className="w-full mt-3 text-xs text-gold hover:underline"
          >
            Şifremi unuttum
          </button>
        )}

        {mode !== "forgot" && (
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full mt-4 text-sm text-muted-foreground"
          >
            {mode === "login" ? "Hesabın yok mu? " : "Zaten üye misin? "}
            <span className="text-gold font-semibold">{mode === "login" ? "Kayıt ol" : "Giriş yap"}</span>
          </button>
        )}

        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-muted-foreground">← Anasayfaya dön</Link>
        </div>
      </div>
    </div>
  );
}
