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
 * Strateji:
 *  1) dist/server içindeki TanStack Start manifestini bul, __root__ preloads
 *     dizisini çıkar.
 *  2) Bulunamazsa dist/client/assets içindeki `index-*.js` dosyalarını
 *     entry olarak kullan (fallback — vite chunk adlandırma sözleşmesi).
 *  3) Hiçbir entry bulunamazsa hata fırlat (sessiz başarısızlık yok).
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
const warn = (m) => console.warn(`[cap-shell] ${m}`);

if (!existsSync(CLIENT)) {
  warn("dist/client yok, atlanıyor (vite build çalışmamış).");
  process.exit(0);
}

const assetsDir = join(CLIENT, "assets");
const allClientAssets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];

function findEntriesFromManifest() {
  if (!existsSync(SERVER)) return [];
  const manifestFiles = readdirSync(SERVER).filter((f) =>
    /tanstack-start-manifest.*\.mjs$/.test(f),
  );
  for (const file of manifestFiles) {
    const src = readFileSync(join(SERVER, file), "utf8");
    // __root__ bloğunda preloads dizisini yakala. children içinde `]` olabilir
    // ama `}` olmaz; assets: void 0 da `}` içermez — `[^}]` güvenli.
    const m = src.match(/__root__:\s*\{[^}]*?preloads:\s*\[([^\]]+)\]/);
    if (!m) continue;
    const scripts = [...m[1].matchAll(/"(\/assets\/[^"]+\.js)"/g)].map(
      (x) => x[1],
    );
    if (scripts.length) {
      log(`manifest: ${file}`);
      return scripts;
    }
  }
  return [];
}

function findEntriesFromAssets() {
  // Vite root entry: assets/index-<hash>.js. Birden fazla varsa hepsini al.
  const matches = allClientAssets
    .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
    .map((f) => `/assets/${f}`);
  if (matches.length) log(`fallback: assets/index-*.js (${matches.length})`);
  return matches;
}

let entryScripts = findEntriesFromManifest();
if (entryScripts.length === 0) entryScripts = findEntriesFromAssets();

if (entryScripts.length === 0) {
  console.error(
    "[cap-shell] HATA: entry script bulunamadı. dist/client/assets içinde index-*.js dosyası ve dist/server içinde TanStack Start manifesti yok.",
  );
  process.exit(1);
}

const cssFiles = allClientAssets
  .filter((f) => f.endsWith(".css"))
  .map((f) => `/assets/${f}`);

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
