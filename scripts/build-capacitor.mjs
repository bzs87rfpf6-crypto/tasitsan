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

const legacyWebViewPolyfills = `    <script>
      (function(){
        if (!Promise.allSettled) Promise.allSettled = function(promises) { return Promise.all(Array.prototype.map.call(promises, function(p) { return Promise.resolve(p).then(function(value) { return { status: 'fulfilled', value: value }; }, function(reason) { return { status: 'rejected', reason: reason }; }); })); };
        if (!Array.prototype.flat) Array.prototype.flat = function(depth) { var d = depth === undefined ? 1 : Number(depth) || 0; var out = []; (function flat(arr, level) { for (var i = 0; i < arr.length; i += 1) { if (!(i in arr)) continue; var v = arr[i]; if (Array.isArray(v) && level > 0) flat(v, level - 1); else out.push(v); } })(this, d); return out; };
        if (!Array.prototype.flatMap) Array.prototype.flatMap = function(callback, thisArg) { return Array.prototype.map.call(this, callback, thisArg).flat(); };
        if (!Object.hasOwn) Object.hasOwn = function(obj, key) { return Object.prototype.hasOwnProperty.call(Object(obj), key); };
        if (!String.prototype.replaceAll) String.prototype.replaceAll = function(search, replacement) { return this.split(search).join(replacement); };
      })();
    </script>`;

const androidDebugFallback = `    <script>
      (function(){
        function isCapacitorLike() {
          return !!window.Capacitor || /; wv\\)|\\bwv\\b|Capacitor/i.test(navigator.userAgent || '');
        }
        function show(message) {
          if (!document.body) return;
          var banner = document.getElementById('tasitsan-android-top-debug-banner');
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'tasitsan-android-top-debug-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 14px;background:#d4a017;color:#14110e;font:800 13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35);';
            document.body.appendChild(banner);
          }
          banner.textContent = message;
        }
        window.__tasitsanAndroidDebugLog = function(message){ show('ANDROID DEBUG BUILD · ' + message); };
        document.addEventListener('DOMContentLoaded', function(){
          if (!isCapacitorLike()) return;
          show('ANDROID DEBUG BUILD · HTML yüklendi');
          var root = document.getElementById('root');
          if (root) {
            root.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:72px 20px 24px;background:#121212;color:#f5f2eb;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center"><section><h1 style="margin:0;font-size:28px;line-height:1.15">Taşıtsan Android Test Ekranı</h1><p style="margin:14px auto 0;max-width:320px;color:#d8d0c2;font-size:14px;line-height:1.5">Bu HTML fallback ekranıdır; React başlamazsa bile görünür.</p></section></main>';
          }
        });
      })();
    </script>`;

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
${legacyWebViewPolyfills}
${androidDebugFallback}
${scriptTags}
  </head>
  <body style="background:#121212;color:#f5f2eb;margin:0;">
    <div id="tasitsan-android-top-debug-banner" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 14px;background:#d4a017;color:#14110e;font:800 13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35);">ANDROID DEBUG BUILD · index.html paket içinde</div>
    <div id="root"><main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:72px 20px 24px;background:#121212;color:#f5f2eb;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center"><section><h1 style="margin:0;font-size:28px;line-height:1.15">Taşıtsan Android Test Ekranı</h1><p style="margin:14px auto 0;max-width:320px;color:#d8d0c2;font-size:14px;line-height:1.5">Bu ekran Capacitor paketindeki statik index.html içinden gelir.</p></section></main></div>
  </body>
</html>
`;

writeFileSync(join(CLIENT, "index.html"), html, "utf8");
log(`yazıldı: ${CLIENT}/index.html`);
log(`entry: ${entryScripts[0]} (+${entryScripts.length - 1} preload)`);
log(`css: ${cssFiles.join(", ") || "(yok)"}`);
log("✓ Capacitor build hazır. Şimdi: npx cap sync android");
