const UNRENDERABLE_EXT = /\.(heic|heif|dng|raw|cr2|cr3|nef|arw|orf|rw2|tif|tiff)(\?|$)/i;
const PART_PHOTOS_OBJECT_PATH = "/storage/v1/object/public/part-photos/";
const PART_PHOTOS_RENDER_PATH = "/storage/v1/render/image/public/part-photos/";

export function isDisplayablePartImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url || UNRENDERABLE_EXT.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return !url.includes(":") && !url.startsWith("/");
  }
}

export function getPartImageDisplayUrl(value: unknown, width = 640): string | null {
  if (!isDisplayablePartImageUrl(value)) return null;
  const original = value.trim();

  try {
    const baseUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;
    const publicUrl = original.startsWith("http")
      ? original
      : `${baseUrl}/storage/v1/object/public/part-photos/${original.replace(/^part-photos\//, "")}`;
    const parsed = new URL(publicUrl);
    if (parsed.pathname.includes(PART_PHOTOS_OBJECT_PATH)) {
      parsed.pathname = parsed.pathname.replace(PART_PHOTOS_OBJECT_PATH, PART_PHOTOS_RENDER_PATH);
    }
    if (parsed.pathname.includes(PART_PHOTOS_RENDER_PATH)) {
      parsed.searchParams.set("width", String(width));
      parsed.searchParams.set("quality", "70");
      parsed.searchParams.set("resize", "contain");
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getSafePartPhotos(values: unknown, broken = new Set<string>(), width = 640) {
  const raw = Array.isArray(values) ? values : [];
  return raw
    .map((original) => ({ original, display: getPartImageDisplayUrl(original, width) }))
    .filter((photo): photo is { original: string; display: string } => {
      if (typeof photo.original !== "string" || !photo.display) return false;
      return !broken.has(photo.original) && !broken.has(photo.display);
    });
}