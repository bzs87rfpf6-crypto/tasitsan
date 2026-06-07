#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const nativeConfigPath = join(
  "android",
  "app",
  "src",
  "main",
  "assets",
  "capacitor.config.json",
);

const expectedUrl = "https://tasitsan.com.tr";

if (!existsSync(nativeConfigPath)) {
  console.warn(
    `[cap-verify] ${nativeConfigPath} bulunamadı; Android native proje bu ortamda yoksa bu normaldir.`,
  );
  process.exit(0);
}

const nativeConfig = JSON.parse(readFileSync(nativeConfigPath, "utf8"));
const actualUrl = nativeConfig?.server?.url ?? null;

if (actualUrl !== expectedUrl) {
  console.error(
    `[cap-verify] HATA: Android capacitor.config.json içinde server.url yok veya hatalı. Beklenen: ${expectedUrl}, gelen: ${actualUrl ?? "(yok)"}`,
  );
  console.error(
    "[cap-verify] Bu durumda APK https://localhost statik shell'e düşer ve TanStack Start hydrate() Invariant failed hatası verir.",
  );
  process.exit(1);
}

console.log(`[cap-verify] OK: Android server.url = ${actualUrl}`);