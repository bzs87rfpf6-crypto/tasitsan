// Kanonik host politikası: yalnızca `www.tasitsan.com.tr`.
// Apex (`tasitsan.com.tr`) ve http istekleri TEK ADIMDA kalıcı 301 ile
// kanonik URL'ye taşınır. Preview/lovable.app/localhost host'ları dokunulmaz,
// böylece yönlendirme zinciri veya loop oluşmaz.

function envHost(name: string): string | null {
  try {
    const v = typeof process !== "undefined" ? process.env?.[name] : undefined;
    if (typeof v === "string" && v.trim()) {
      return v.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
    }
  } catch {
    /* env yoksa varsayılan kullanılır */
  }
  return null;
}

// Kanonik host env ile geçersiz kılınabilir (self-host / farklı alan adı).
// CANONICAL_HOST="" verilirse yönlendirme tamamen kapanır.
export const CANONICAL_HOST = envHost("CANONICAL_HOST") ?? "www.tasitsan.com.tr";
export const APEX_HOSTS = (envHost("CANONICAL_APEX_HOST") ?? "tasitsan.com.tr")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

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

  // IP üzerinden (veya yapılandırılmamışsa) erişimde asla alan adına zorlanmaz.
  if (!CANONICAL_HOST) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === "localhost") return null;

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
