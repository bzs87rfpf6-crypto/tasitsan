#!/usr/bin/env node
/**
 * Capacitor Android/iOS için statik SPA bundle üretir.
 *
 * TanStack Start build çıktısı (.output/public) Cloudflare Worker SSR için
 * tasarlanmıştır ve içinde root index.html yoktur. Capacitor ise webDir
 * altında index.html bekler. Bu script:
 *   1. Standart `vite build`'i çalıştırır.
 *   2. .output/public içeriğini dist/client/ altına kopyalar.
 *   3. Vite client manifestinden entry script'i bulup SPA shell
 *      dist/client/index.html dosyasını üretir.
 *
 * Uygulama Capacitor içinde tamamen client-side render edilir; server
 * function çağrıları çalışma anında prod web origin'e (capacitor.config.ts
 * server.hostname) gider.
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const SRC = ".output/public";
const DEST = "dist/client";

function log(msg) {
  console.log(`[cap-build] ${msg}`);
}

log("running `vite build`…");
execSync("vite build", { stdio: "inherit" });

if (!existsSync(SRC)) {
  throw new Error(
    `Beklenen build çıktısı bulunamadı: ${SRC}. vite build başarısız olmuş olabilir.`,
  );
}

log(`temizleniyor: ${DEST}`);
rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

log(`kopyalanıyor: ${SRC} → ${DEST}`);
cpSync(SRC, DEST, { recursive: true });

// Vite manifest'ini bul (TanStack Start farklı sürümlerde farklı yere yazıyor).
function findManifest(root) {
  const candidates = [
    join(root, ".vite", "manifest.json"),
    join(root, "_build", ".vite", "manifest.json"),
    join(root, "_build", "manifest.json"),
    join(root, "manifest.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return { path: p, root };
  }
  // Recursive arama (son çare).
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (name === "manifest.json" && full.includes(".vite")) {
        return { path: full, root };
      }
    }
  }
  return null;
}

const found = findManifest(DEST);
if (!found) {
  log(
    "UYARI: Vite manifest bulunamadı. dist/client/index.html oluşturulamıyor.",
  );
  log("Klasör içeriği:");
  log(readdirSync(DEST).join(", "));
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(found.path, "utf8"));

// Entry chunk'ı bul (isEntry: true). Birden fazlaysa client entry'yi tercih et.
const entries = Object.values(manifest).filter((c) => c && c.isEntry);
if (entries.length === 0) {
  throw new Error("Manifest'te isEntry: true chunk bulunamadı.");
}
const entry =
  entries.find((c) => /client|entry/.test(c.src || c.file || "")) ?? entries[0];

// Manifest dosya yolları .output/public köküne göre. dist/client'a kopyaladık,
// bu yüzden / kökten serve edilebilirler.
const scripts = new Set([entry.file]);
const css = new Set(entry.css ?? []);
const visited = new Set();
function collectImports(chunkKey) {
  if (visited.has(chunkKey)) return;
  visited.add(chunkKey);
  const chunk = manifest[chunkKey];
  if (!chunk) return;
  for (const c of chunk.css ?? []) css.add(c);
  for (const k of chunk.imports ?? []) collectImports(k);
}
for (const key of Object.keys(manifest)) {
  if (manifest[key] === entry) collectImports(key);
}

const moduleTags = [...scripts]
  .map((f) => `    <script type="module" crossorigin src="/${f}"></script>`)
  .join("\n");
const cssTags = [...css]
  .map((f) => `    <link rel="stylesheet" crossorigin href="/${f}" />`)
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
  </head>
  <body>
    <div id="root"></div>
${moduleTags}
  </body>
</html>
`;

writeFileSync(join(DEST, "index.html"), html, "utf8");
log(`yazıldı: ${join(DEST, "index.html")}`);
log(`entry: ${entry.file}`);
log(`css: ${[...css].join(", ") || "(yok)"}`);
log("✓ Capacitor build tamamlandı. Şimdi: npx cap sync android");
