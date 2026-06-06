#!/usr/bin/env node
/**
 * Capacitor için dist/client/index.html SPA shell üretir.
 *
 * Vite build BİTTİKTEN sonra çalışır (package.json "postbuild" hook'u).
 * TanStack Start prod'da HTML'i her istekte SSR ile render eder, dolayısıyla
 * dist/client içine root index.html koymaz. Capacitor ise webDir altında
 * index.html bekler — burada bunu manifestten gerçek asset path'leriyle
 * üretiyoruz. SSR yayını etkilenmez: Cloudflare Worker route'ları statik
 * fallback'ten önce gelir.
 *
 * Vite build çalışmadıysa (dist yoksa) sessizce çıkar — `cap sync` hatasını
 * postbuild patlamasıyla maskelememek için.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CLIENT = "dist/client";
const SERVER = "dist/server";

const log = (m) => console.log(`[cap-shell] ${m}`);

if (!existsSync(CLIENT) || !existsSync(SERVER)) {
  log("dist yok, atlanıyor (vite build çalışmamış).");
  process.exit(0);
}

const manifestFile = readdirSync(SERVER).find((f) =>
  /^_tanstack-start-manifest_v-.*\.mjs$/.test(f),
);
if (!manifestFile) {
  log("UYARI: TanStack Start manifesti bulunamadı, index.html üretilemedi.");
  process.exit(0);
}
const manifestSrc = readFileSync(join(SERVER, manifestFile), "utf8");

const rootMatch = manifestSrc.match(
  /__root__:\s*\{[^}]*?preloads:\s*\[([^\]]+)\]/,
);
if (!rootMatch) {
  log("UYARI: __root__ preloads çıkarılamadı, index.html üretilemedi.");
  process.exit(0);
}
const entryScripts = [...rootMatch[1].matchAll(/"(\/assets\/[^"]+\.js)"/g)].map(
  (m) => m[1],
);
if (entryScripts.length === 0) {
  log("UYARI: __root__ preloads boş.");
  process.exit(0);
}

const assetsDir = join(CLIENT, "assets");
const cssFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => `/assets/${f}`)
  : [];

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
    <meta name="theme-color" content="#0a0907" />
    <title>Taşıtsan</title>
    <link rel="icon" href="/icon-192.png" />
    <link rel="manifest" href="/manifest.json" />
${cssTags}
${scriptTags}
  </head>
  <body style="background:#0a0907;color:#f5f2eb;margin:0;">
    <div id="root"></div>
  </body>
</html>
`;

writeFileSync(join(CLIENT, "index.html"), html, "utf8");
log(`✓ ${CLIENT}/index.html yazıldı (entry ${entryScripts[0]}).`);
