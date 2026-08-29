#!/usr/bin/env node
/**
 * Self-host launcher: loads .env into process.env (without overriding vars
 * already provided by the environment, e.g. Docker env_file), then starts
 * the built server. Works on any Node >= 18, no --env-file flag needed.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const envPath = resolve(process.cwd(), ".env");

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

if (existsSync(envPath)) {
  let loaded = 0;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    // Never override variables already set by the shell / Docker env_file.
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded += 1;
    }
  }
  console.log(`[selfhost] .env yüklendi (${loaded} değişken eklendi).`);
} else {
  console.warn("[selfhost] .env bulunamadı; yalnızca ortam değişkenleri kullanılacak.");
}

const entry = resolve(process.cwd(), ".output/server/index.mjs");
if (!existsSync(entry)) {
  console.error(`[selfhost] Derlenmiş sunucu bulunamadı: ${entry}`);
  console.error("[selfhost] Önce 'npm run build:selfhost' çalıştırın.");
  process.exit(1);
}

await import(pathToFileURL(entry).href);
