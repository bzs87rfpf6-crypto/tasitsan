import { User } from "lucide-react";

interface Props {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ url, name, size = 40, className = "" }: Props) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? "Profil"}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`rounded-full object-cover border border-border bg-secondary ${className}`}
        style={style}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      style={style}
      className={`rounded-full bg-gold/10 border border-gold/30 text-gold grid place-items-center font-semibold ${className}`}
    >
      {initial && initial !== "?" ? (
        <span style={{ fontSize: Math.max(12, size * 0.4) }}>{initial}</span>
      ) : (
        <User style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  );
}
