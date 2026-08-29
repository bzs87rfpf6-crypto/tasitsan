import corporateLogoAsset from "@/assets/tasitsan-corporate-logo-v2.png.asset.json";

// Lovable Cloud'da logo CDN'den (/__l5e/assets-v1/...) servis edilir.
// Self-host (VPS/Docker) build'inde bu yol yoktur; aynı dosya public/brand
// altından servis edilir. VITE_SELFHOST=true ile yerel yola geçilir.
const SELFHOST = import.meta.env["VITE_SELFHOST"] === "true";

export const CORPORATE_LOGO_SRC = SELFHOST
  ? "/brand/tasitsan-corporate-logo-v2.png?v=20260812-2"
  : `${corporateLogoAsset.url}?v=20260812-2`;
