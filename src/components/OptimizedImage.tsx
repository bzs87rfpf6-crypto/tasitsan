// Responsive görsel bileşeni — Supabase Storage render endpoint'i üzerinden
// otomatik WebP dönüşümü ve srcset üretir. width/height ile CLS önler.

import { useMemo } from "react";

interface Props {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

const SUPABASE_RENDER = /\/storage\/v1\/object\/public\//;
const WIDTHS = [320, 480, 640, 960, 1280, 1600];

function buildRender(url: string, w: number, format: "webp" | "avif" | "origin"): string {
  if (!SUPABASE_RENDER.test(url)) return url;
  const rendered = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const sep = rendered.includes("?") ? "&" : "?";
  const fmt = format === "origin" ? "" : `&format=${format}`;
  return `${rendered}${sep}width=${w}&resize=contain&quality=78${fmt}`;
}

export function OptimizedImage({ src, alt, width, height, sizes = "(max-width: 768px) 100vw, 50vw", priority, className }: Props) {
  const sources = useMemo(() => {
    const supportsRender = SUPABASE_RENDER.test(src);
    if (!supportsRender) return null;
    const webp = WIDTHS.map((w) => `${buildRender(src, w, "webp")} ${w}w`).join(", ");
    const avif = WIDTHS.map((w) => `${buildRender(src, w, "avif")} ${w}w`).join(", ");
    return { webp, avif };
  }, [src]);

  const imgProps = {
    alt,
    width,
    height,
    className,
    loading: priority ? ("eager" as const) : ("lazy" as const),
    decoding: "async" as const,
    fetchPriority: (priority ? "high" : "auto") as "high" | "auto",
  };

  if (!sources) {
    return <img src={src} {...imgProps} />;
  }
  return (
    <picture>
      <source type="image/avif" srcSet={sources.avif} sizes={sizes} />
      <source type="image/webp" srcSet={sources.webp} sizes={sizes} />
      <img src={src} srcSet={sources.webp} sizes={sizes} {...imgProps} />
    </picture>
  );
}
