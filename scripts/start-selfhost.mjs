#!/usr/bin/env node
/**
 * Self-host launcher: `.env` dosyalarını process.env'e yükler (ortamda zaten
 * tanımlı olanları EZMEDEN), isim normalizasyonu/aynalamasını yapar ve derlenmiş
 * sunucuyu başlatır. Node >= 18, --env-file bayrağına gerek yok.
 *
 * Öncelik: gerçek ortam değişkenleri > SELFHOST_ENV_FILE > .env.local > .env
 * `.env` repoda izlendiği için `git pull` onu geri yazabilir; sunucuya özel
 * sırlar (service-role vb.) `.env.local` veya SELFHOST_ENV_FILE içinde tutulmalı.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFile, normalizeEnv } from "./selfhost-env.mjs";

const candidateFiles = [
  process.env.SELFHOST_ENV_FILE,
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), ".env"),
].filter(Boolean);

let anyLoaded = false;
for (const file of candidateFiles) {
  const { loaded, found } = loadEnvFile(file, process.env);
  if (!found) continue;
  anyLoaded = true;
  console.log(`[selfhost] ${file} yüklendi (${loaded} değişken eklendi).`);
}
if (!anyLoaded) {
  console.warn("[selfhost] env dosyası bulunamadı; yalnızca ortam değişkenleri kullanılacak.");
}

normalizeEnv(process.env);

console.log(
  "[selfhost] Supabase env:",
  JSON.stringify({
    SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "missing",
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ? "set" : "missing",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
  }),
);

const entry = resolve(process.cwd(), ".output/server/index.mjs");
if (!existsSync(entry)) {
  console.error(`[selfhost] Derlenmiş sunucu bulunamadı: ${entry}`);
  console.error("[selfhost] Önce 'npm run build:selfhost' çalıştırın.");
  process.exit(1);
}

await import(pathToFileURL(entry).href);
