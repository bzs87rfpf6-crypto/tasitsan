#!/usr/bin/env node
/**
 * Capacitor Android/iOS için statik SPA shell üretir.
 *
 * TanStack Start build çıktısı dist/client/ altına asset'leri (JS/CSS/ikon)
 * yazıyor ama root index.html üretmiyor — çünkü prod'da HTML her istekte
 * Cloudflare Worker SSR (dist/server) tarafından render ediliyor.
 *
 * Capacitor ise webDir altında bir index.html bekler. Bu script vite build
 * sonrası TanStack Start manifestinden client entry script ve CSS'i bulup
 * dist/client/index.html SPA shell'ini sentezler. Uygulama Capacitor içinde
 * tamamen client-side hidrate olur; server function çağrıları
 * capacitor.config.ts'deki server.hostname'e gider (https://tasitsan.com.tr).
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CLIENT = "dist/client";
const SERVER = "dist/server";

const log = (m) => console.log(`[cap-build] ${m}`);

log("running `vite build`…");
execSync("npx vite build", { stdio: "inherit" });

if (!existsSync(CLIENT)) {
  throw new Error(`Beklenen build çıktısı yok: ${CLIENT}.`);
}

// 1) TanStack Start manifestinden __root__ entry preload'larını çıkar.
const manifestFile = readdirSync(SERVER).find((f) =>
  /^_tanstack-start-manifest_v-.*\.mjs$/.test(f),
);
if (!manifestFile) {
  throw new Error(`${SERVER} içinde _tanstack-start-manifest_v-*.mjs yok.`);
}
const manifestSrc = readFileSync(join(SERVER, manifestFile), "utf8");

// __root__ preload bloğu: "preloads": ["/assets/...js", ...]
const rootMatch = manifestSrc.match(
  /__root__:\s*\{[^}]*?preloads:\s*\[([^\]]+)\]/,
);
if (!rootMatch) {
  throw new Error("Manifestte __root__ preloads bulunamadı.");
}
const entryScripts = [...rootMatch[1].matchAll(/"(\/assets\/[^"]+\.js)"/g)].map(
  (m) => m[1],
);
if (entryScripts.length === 0) {
  throw new Error("__root__ preloads boş.");
}

// 2) CSS dosyalarını bul (router bundle'ında referans var, dist/client/assets/*.css).
const cssFiles = readdirSync(join(CLIENT, "assets"))
  .filter((f) => f.endsWith(".css"))
  .map((f) => `/assets/${f}`);

// 3) SPA shell yaz.
const scriptTags = entryScripts
  .map((src, i) =>
    i === 0
      ? `    <script type="module" crossorigin src="${src}"></script>`
      : `    <link rel="modulepreload" crossorigin href="${src}" />`,
  )
  .join("\n");
const cssTags = cssFiles
  .map((href) => `    <link rel="stylesheet" crossorigin href="${href}" />`)
  .join("\n");

const html = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#121212" />
    <title>Taşıtsan</title>
    <link rel="icon" href="/favicon.png" />
    <link rel="manifest" href="/manifest.json" />
${cssTags}
${scriptTags}
  </head>
  <body style="background:#121212;color:#f5f2eb;margin:0;">
    <div id="root"></div>
  </body>
</html>
`;

writeFileSync(join(CLIENT, "index.html"), html, "utf8");
log(`yazıldı: ${CLIENT}/index.html`);
log(`entry: ${entryScripts[0]} (+${entryScripts.length - 1} preload)`);
log(`css: ${cssFiles.join(", ") || "(yok)"}`);
log("✓ Capacitor build hazır. Şimdi: npx cap sync android");
