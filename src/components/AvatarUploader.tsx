import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "./UserAvatar";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const SIGNED_EXPIRY = 60 * 60 * 24 * 365 * 5; // ~5 years

interface Props {
  userId: string;
  displayName?: string | null;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
}

export function AvatarUploader({ userId, displayName, avatarUrl, onChange }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    const { validateFile, FILE_LIMITS } = await import("@/lib/file-upload-validation");
    const v = await validateFile(file, "image", { maxBytes: FILE_LIMITS.avatar });
    if (!v.ok) {
      toast.error(v.reason);
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;

      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, SIGNED_EXPIRY);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("URL alınamadı");

      // Best-effort cleanup of previous file
      const prevPath = extractPath(avatarUrl);
      if (prevPath) {
        supabase.storage.from("avatars").remove([prevPath]).catch(() => {});
      }

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: signed.signedUrl })
        .eq("id", userId);
      if (dbErr) throw dbErr;

      onChange(signed.signedUrl);
      toast.success("Profil fotoğrafı güncellendi");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Yükleme başarısız";
      toast.error(msg);
    } finally {
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!avatarUrl) return;
    if (!confirm("Profil fotoğrafını kaldırmak istiyor musun?")) return;
    setBusy(true);
    try {
      const path = extractPath(avatarUrl);
      if (path) await supabase.storage.from("avatars").remove([path]);
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      if (error) throw error;
      onChange(null);
      toast.success("Profil fotoğrafı kaldırıldı");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaldırılamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar url={avatarUrl} name={displayName} size={72} />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-background/60 rounded-full">
            <Loader2 className="size-5 animate-spin text-gold" />
          </div>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-semibold bg-gold-gradient text-gold-foreground disabled:opacity-50"
          >
            <ImagePlus className="size-3.5" /> Galeri
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-semibold border border-border hover:border-gold disabled:opacity-50"
          >
            <Camera className="size-3.5" /> Kamera
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Kaldır
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP — en fazla 5MB</p>
      </div>
    </div>
  );
}

function extractPath(signedUrl: string | null): string | null {
  if (!signedUrl) return null;
  // Signed URL format: .../storage/v1/object/sign/avatars/<userId>/<file>?token=...
  const m = signedUrl.match(/\/avatars\/([^?]+)/);
  return m ? m[1] : null;
}
