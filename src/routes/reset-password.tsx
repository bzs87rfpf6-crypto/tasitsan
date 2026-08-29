import { translateError } from "@/lib/error-messages";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Şifre Sıfırla — Taşıtsan" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};
    if (password.length < 6) errs.password = "Şifre en az 6 karakter olmalıdır.";
    if (password !== confirm) errs.confirm = "Şifreler eşleşmiyor.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Şifren güncellendi. Giriş yapabilirsin.");
      await supabase.auth.signOut();
      nav({ to: "/auth" });
    } catch (err: any) {
      toast.error(translateError(err, "Bir hata oluştu"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader subtitle="Şifre Sıfırla" />
      <div className="max-w-md mx-auto px-4 pt-8 pb-12">
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl text-gold">YENİ ŞİFRE</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {ready
              ? "Yeni şifreni belirle."
              : "Bağlantı doğrulanıyor… E-postandaki bağlantıyla geldiysen birkaç saniye bekle."}
          </p>
        </div>

        {ready ? (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div>
              <PasswordInput
                placeholder="Yeni şifre"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="h-12 bg-card"
              />
              {errors.password && (
                <p className="text-xs text-destructive mt-1 px-1">{errors.password}</p>
              )}
            </div>
            <div>
              <PasswordInput
                placeholder="Yeni şifre (tekrar)"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="h-12 bg-card"
              />
              {errors.confirm && (
                <p className="text-xs text-destructive mt-1 px-1">{errors.confirm}</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90"
            >
              {loading ? "..." : "Şifreyi Güncelle"}
            </Button>
          </form>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            Geçerli bir sıfırlama bağlantısı bulunamadı.
          </div>
        )}

        <div className="text-center mt-6">
          <Link to="/auth" className="text-xs text-muted-foreground">
            ← Giriş ekranına dön
          </Link>
        </div>
      </div>
    </div>
  );
}
