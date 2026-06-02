import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Şifre Sıfırla — Taşıtsan" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in URL hash and creates a session via detectSessionInUrl
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
    if (password.length < 6) return toast.error("Şifre en az 6 karakter olmalı");
    if (password !== confirm) return toast.error("Şifreler eşleşmiyor");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Şifren güncellendi. Giriş yapabilirsin.");
      await supabase.auth.signOut();
      nav({ to: "/auth" });
    } catch (err: any) {
      toast.error(err.message ?? "Bir hata oluştu");
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
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              placeholder="Yeni şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-12 bg-card"
            />
            <Input
              type="password"
              placeholder="Yeni şifre (tekrar)"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="h-12 bg-card"
            />
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
