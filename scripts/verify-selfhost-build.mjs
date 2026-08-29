#!/usr/bin/env node
/**
 * Self-host build doğrulaması.
 * `.output/public/assets` içinde CSS/JS üretilmiş mi ve logo dosyası
 * kopyalanmış mı kontrol eder. Eksikse build'i başarısız sayar.
 */
import { existsSync, readdirSync } from "node:fs";

const PUBLIC = ".output/public";
const ASSETS = `${PUBLIC}/assets`;
const fail = (m) => {
  console.error(`[selfhost-verify] HATA: ${m}`);
  process.exit(1);
};

if (!existsSync(ASSETS)) fail(`${ASSETS} yok — client build çıktısı üretilmemiş.`);

const files = readdirSync(ASSETS);
const js = files.filter((f) => f.endsWith(".js"));
const css = files.filter((f) => f.endsWith(".css"));
if (js.length === 0) fail(`${ASSETS} içinde .js yok.`);
if (css.length === 0) fail(`${ASSETS} içinde .css yok.`);

const logo = `${PUBLIC}/brand/tasitsan-corporate-logo-v2.png`;
if (!existsSync(logo)) fail(`${logo} yok — self-host logo yolu 404 verir.`);

console.log(
  `[selfhost-verify] ✓ ${js.length} js, ${css.length} css asset ve logo mevcut.`,
);
