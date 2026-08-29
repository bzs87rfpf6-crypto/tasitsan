// Kanonik host politikası: yalnızca `www.tasitsan.com.tr`.
// Apex (`tasitsan.com.tr`) ve http istekleri TEK ADIMDA kalıcı 301 ile
// kanonik URL'ye taşınır. Preview/lovable.app/localhost host'ları dokunulmaz,
// böylece yönlendirme zinciri veya loop oluşmaz.

export const CANONICAL_HOST = "www.tasitsan.com.tr";
export const APEX_HOSTS = ["tasitsan.com.tr"];

export function canonicalHostRedirect(request: Request): Response | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const rawHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const host = rawHost.toLowerCase().split(",")[0]!.trim().split(":")[0]!;
  const proto = (
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  )
    .toLowerCase()
    .split(",")[0]!
    .trim();

  const isCanonicalHost = host === CANONICAL_HOST;
  const isApex = APEX_HOSTS.includes(host);
  if (!isCanonicalHost && !isApex) return null;
  if (isCanonicalHost && proto === "https") return null;

  return new Response(null, {
    status: 301,
    headers: {
      Location: `https://${CANONICAL_HOST}${url.pathname}${url.search}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
