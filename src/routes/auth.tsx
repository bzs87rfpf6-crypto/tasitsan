import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Giriş — Taşıtsan" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");

  const sendReset = async () => {
    if (!email) { toast.error("Önce e-posta gir"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name, whatsapp },
          },
        });
        if (error) throw error;
        toast.success("Hesap oluşturuldu! Hemen ilan vermeye başlayabilirsin.");
        if (data.session) {
          nav({ to: "/" });
        } else {
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Hoş geldin!");
        nav({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Google ile giriş başarısız");
  };

  return (
    <div className="min-h-screen">
      <AppHeader subtitle={mode === "login" ? "Giriş Yap" : "Kayıt Ol"} />
      <div className="max-w-md mx-auto px-4 pt-8 pb-12">
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl text-gold">
            {mode === "login" ? "TEKRAR HOŞ GELDİN" : "ARAMIZA KATIL"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "login" ? "Parçanı sat, alıcılara ulaş." : "Saniyeler içinde ilan vermeye başla."}
          </p>
        </div>

        <Button onClick={google} variant="outline" className="w-full h-12 border-border bg-card hover:bg-secondary mb-4">
          <svg viewBox="0 0 24 24" className="size-5 mr-2"><path fill="#fff" d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.65 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.83 3.97 14.6 3 12 3 6.98 3 3 6.98 3 12s3.98 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.6-.07-1.05-.15-1.5z"/></svg>
          Google ile devam et
        </Button>

        <div className="flex items-center gap-3 my-4 text-xs text-muted-foreground">
          <div className="h-px bg-border flex-1" /> VEYA <div className="h-px bg-border flex-1" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <>
              <Input placeholder="Adın veya işletme adı" value={name} onChange={(e) => setName(e.target.value)} required className="h-12 bg-card" />
              <Input placeholder="WhatsApp (5xx xxx xx xx)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required className="h-12 bg-card" />
            </>
          )}
          <Input type="email" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 bg-card" />
          <Input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-12 bg-card" />
          <Button type="submit" disabled={loading} className="w-full h-12 bg-gold-gradient text-gold-foreground font-semibold shadow-gold hover:opacity-90">
            {loading ? "..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full mt-4 text-sm text-muted-foreground"
        >
          {mode === "login" ? "Hesabın yok mu? " : "Zaten üye misin? "}
          <span className="text-gold font-semibold">{mode === "login" ? "Kayıt ol" : "Giriş yap"}</span>
        </button>

        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-muted-foreground">← Anasayfaya dön</Link>
        </div>
      </div>
    </div>
  );
}
