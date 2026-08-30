import { translateError } from "@/lib/error-messages";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/oauth-google";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { checkAuthLockout, recordAuthFailure, clearAuthFailures, checkRateLimit } from "@/lib/security.functions";
import { logSignupFailure } from "@/lib/signup-failures.functions";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Giriş — Taşıtsan" },
      // Auth is a private utility page: never indexed, and link equity must not
      // flow into ?redirect= variants that Google could pick as a canonical.
      { name: "robots", content: "noindex,nofollow" },
    ],
    // Self-canonical without query string so /auth?redirect=/parts/... can never
    // be chosen as the canonical of a public product URL.
    links: [{ rel: "canonical", href: "https://www.tasitsan.com.tr/auth" }],
  }),

  component: AuthPage,
});


// Auth requires an email under the hood. We synthesize a stable identifier
// from the phone number so users can sign up & log in with phone only.
const PHONE_DOMAIN = "phone.tasitsan.local";

function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d;
}

function phoneToAuthEmail(phone: string): string {
  return `${normalizePhone(phone)}@${PHONE_DOMAIN}`;
}

type FieldErrors = Partial<Record<"name" | "phone" | "loginId" | "email" | "password", string>>;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1 px-1">{msg}</p>;
}

function AuthPage() {
  const getRedirect = (): string => {
    if (typeof window === "undefined") return "/";
    const r = new URL(window.location.href).searchParams.get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) return r;
    return "/";
  };
  const goPostAuth = () => {
    const target = getRedirect();
    window.location.assign(target);
  };
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [phone, setPhone] = useState("");
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // OAuth dönüşünde korunan admin/deep-link hedefine devam et. Dönüş hedefi
  // yalnızca aynı origin içindeki güvenli bir path olarak kabul edilir.
  useEffect(() => {
    const target = getRedirect();
    if (target === "/") return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) window.location.replace(target);
    });
    return () => { cancelled = true; };
  }, []);

  const lockoutCheck = useServerFn(checkAuthLockout);
  const recordFailure = useServerFn(recordAuthFailure);
  const clearFailures = useServerFn(clearAuthFailures);
  const rateLimit = useServerFn(checkRateLimit);

  // ---- Signup funnel analytics (kişisel veri / şifre KAYDEDİLMEZ) ----
  const viewedRef = useRef(false);
  const startedRef = useRef(false);
  useEffect(() => {
    if (mode !== "signup" || viewedRef.current) return;
    viewedRef.current = true;
    void trackEvent("signup_view", { source: "auth_page" });
  }, [mode]);
  const markSignupStart = (field: string) => {
    if (mode !== "signup" || startedRef.current) return;
    startedRef.current = true;
    void trackEvent("signup_start", { source: "auth_page", field });
  };

  const switchMode = (m: "login" | "signup" | "forgot") => {
    setErrors({});
    setMode(m);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const isSignup = mode === "signup";
    if (isSignup) {
      markSignupStart("google");
      void trackEvent("signup_submit", { method: "google" });
    }
    try {
      const target = getRedirect();
      const callback = new URL("/auth", window.location.origin);
      if (target !== "/") callback.searchParams.set("redirect", target);
      const result = await signInWithGoogle(callback.toString());
      if (result.error) {
        if (isSignup) void trackEvent("signup_error", { method: "google", error_code: "oauth_error" });
        toast.error(translateError(result.error, "Google ile giriş başarısız"));
        return;
      }
      if (isSignup && !result.redirected) void trackEvent("signup_success", { method: "google" });
      if (result.redirected) return;
      toast.success("Hoş geldin!");
      goPostAuth();
    } catch (err: any) {
      toast.error(translateError(err, "Google ile giriş başarısız"));
    } finally {
      setGoogleLoading(false);
    }
  };

  const sendReset = async () => {
    const target = email.trim();
    if (!target) {
      setErrors({ email: "Kayıtlı e-posta adresini gir." });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Sıfırlama bağlantısı e-postana gönderildi.");
      switchMode("login");
    } catch (err: any) {
      toast.error(translateError(err, "Bir hata oluştu"));
    } finally {
      setLoading(false);
    }
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (mode === "signup") {
      if (!name.trim()) e.name = "Ad-Soyad veya firma adı zorunlu.";
      const digits = normalizePhone(phone);
      if (digits.length < 10) e.phone = "Geçerli bir telefon numarası gir (10 hane).";
    } else {
      if (!loginId.trim()) e.loginId = "Telefon veya e-posta gir.";
      else if (!loginId.includes("@")) {
        const digits = normalizePhone(loginId);
        if (digits.length < 10) e.loginId = "Geçerli bir telefon veya e-posta gir.";
      }
    }
    if (password.length < 6) e.password = "Şifre en az 6 karakter olmalıdır.";
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setLoading(true);
    try {
      if (mode === "signup") {
        const digits = normalizePhone(phone);
        void trackEvent("signup_submit", { method: "phone" });

        const rl = await rateLimit({
          data: { action: "signup", max: 5, windowSeconds: 600, scope: "ip" },
        });
        if (!rl.allowed) {
          void trackEvent("signup_error", { method: "phone", error_code: "rate_limited" });
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
              company_name: companyName.trim() || null,
            },
          },
        });
        if (error) throw error;
        void trackEvent("signup_success", { method: "phone", auto_session: !!data.session });
        if (data.session) {
          toast.success("Üyeliğin hazır! Hemen parça arayabilir, talep oluşturabilirsin.", { duration: 5000 });
          goPostAuth();
        } else {
          toast.success("Üyeliğin oluşturuldu. Şimdi giriş yapabilirsin.", { duration: 5000 });
          switchMode("login");
        }
      } else {
        const raw = loginId.trim();
        const isEmail = raw.includes("@");
        const authEmail = isEmail ? raw.toLowerCase() : phoneToAuthEmail(normalizePhone(raw));

        const lock = await lockoutCheck({ data: { identifier: authEmail } });
        if (lock.locked) {
          toast.error("Hesap geçici olarak kilitlendi. 15 dakika sonra tekrar dene.");
          setLoading(false);
          return;
        }

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
          recordFailure({ data: { identifier: authEmail, kind: isEmail ? "email" : "phone" } }).catch(() => {});
          throw error;
        }
        clearFailures({ data: { identifier: authEmail } }).catch(() => {});
        toast.success("Hoş geldin!");
        goPostAuth();
      }
    } catch (err: any) {
      const msg = translateError(err);
      if (mode === "signup") {
        const digits = normalizePhone(phone);
        // Funnel olayı: yalnızca hata kodu — kişisel veri/şifre gönderilmez.
        void trackEvent("signup_error", {
          method: "phone",
          error_code: String(err?.code || err?.status || err?.name || "unknown"),
        });
        logSignupFailure({
          data: {
            displayName: name.trim() || null,
            email: email.trim() || null,
            phone: digits || null,
            companyName: companyName.trim() || null,
            errorCode: err?.code || err?.status?.toString() || err?.name || null,
            errorMessage: msg,
            formData: {
              mode: "signup",
              name: name.trim(),
              company: companyName.trim(),
              email: email.trim(),
              phone_raw: phone,
              phone_normalized: digits,
            },
          },
        }).catch((logErr) => console.error("[signup failure log]", logErr));
        toast.error(msg, { duration: 7000 });
      } else if (mode === "login" && /invalid/i.test(msg)) {
        setErrors({ password: "Telefon/e-posta veya şifre hatalı." });
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
      <div className="max-w-md mx-auto px-4 pt-6 pb-12 sm:pt-8">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl sm:text-4xl text-gold">
            {mode === "login" ? "TEKRAR HOŞ GELDİN" : mode === "signup" ? "ARAMIZA KATIL" : "ŞİFREMİ UNUTTUM"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "signup"
              ? "Telefon numaranla saniyeler içinde kayıt ol."
              : mode === "login"
              ? "Telefon numaran veya e-postan ile giriş yap."
              : "E-postan varsa sıfırlama bağlantısı gönderelim."}
          </p>
        </div>

        {mode === "signup" && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed mb-4">
            <span className="text-gold font-semibold">Üyelik ücretsiz ve anında aktif.</span> Kayıt olur olmaz parça
            arayabilir, talep oluşturabilir ve satıcılarla iletişime geçebilirsin. Yalnızca ilan vermek için
            satıcı onayı gerekir.
          </div>
        )}

        {/* Google sign-in — available for login & signup */}
        {mode !== "forgot" && (
          <>
            <Button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              variant="outline"
              className="w-full h-12 bg-card border-border hover:bg-muted text-foreground font-medium gap-2"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              {googleLoading ? "..." : "Google ile devam et"}
            </Button>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">veya</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {mode === "forgot" ? (
          <div className="space-y-3">
            <div>
              <Input
                type="email"
                placeholder="Kayıtlı e-posta"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                className="h-12 bg-card"
              />
              <FieldError msg={errors.email} />
            </div>
            <Button onClick={sendReset} disabled={loading} className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
              {loading ? "..." : "Sıfırlama Bağlantısı Gönder"}
            </Button>
            <button type="button" onClick={() => switchMode("login")} className="w-full text-sm text-muted-foreground py-2">
              ← Girişe dön
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            {mode === "signup" && (
              <>
                <div>
                  <Input
                    placeholder="Ad-Soyad"
                    value={name}
                    onChange={(e) => { markSignupStart("name"); setName(e.target.value); }}
                    autoComplete="name"
                    maxLength={120}
                    className="h-12 bg-card"
                  />
                  <FieldError msg={errors.name} />
                </div>
                <div>
                  <Input
                    placeholder="Firma adı (isteğe bağlı)"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoComplete="organization"
                    maxLength={150}
                    className="h-12 bg-card"
                  />
                </div>
              </>
            )}
            {mode === "signup" ? (
              <div>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="Telefon (5xx xxx xx xx)"
                  value={phone}
                  onChange={(e) => { markSignupStart("phone"); setPhone(e.target.value); }}
                  className="h-12 bg-card"
                />
                <FieldError msg={errors.phone} />
              </div>
            ) : (
              <div>
                <Input
                  type="text"
                  placeholder="Telefon veya e-posta"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  className="h-12 bg-card"
                />
                <FieldError msg={errors.loginId} />
              </div>
            )}
            {mode === "signup" && (
              <div>
                <Input
                  type="email"
                  placeholder="E-posta (isteğe bağlı)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  className="h-12 bg-card"
                />
              </div>
            )}
            <div>
              <PasswordInput
                placeholder="Şifre (en az 6 karakter)"
                value={password}
                onChange={(e) => { markSignupStart("password"); setPassword(e.target.value); }}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                className="h-12 bg-card"
              />
              <FieldError msg={errors.password} />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
              {loading ? "..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
            </Button>
          </form>
        )}

        {mode === "login" && (
          <button
            type="button"
            onClick={() => switchMode("forgot")}
            className="w-full mt-3 text-xs text-gold hover:underline py-2"
          >
            Şifremi unuttum
          </button>
        )}

        {mode !== "forgot" && (
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="w-full mt-4 text-sm text-muted-foreground py-2"
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
