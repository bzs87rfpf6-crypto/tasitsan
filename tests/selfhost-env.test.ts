import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — saf JS yardımcı modül
import { loadEnvFile, normalizeEnv, parseLine } from "../scripts/selfhost-env.mjs";
import pkg from "../package.json";
import lock from "../package-lock.json";

describe("self-host env yükleyici", () => {
  it("tırnaklı/tırnaksız/yorumlu satırları doğru ayrıştırır", () => {
    expect(parseLine('export FOO="bar baz"')).toEqual(["FOO", "bar baz"]);
    expect(parseLine("FOO=bar # açıklama")).toEqual(["FOO", "bar"]);
    expect(parseLine("# yorum")).toBeNull();
    expect(parseLine("GECERSIZ")).toBeNull();
    expect(parseLine("KEY='a=b'")).toEqual(["KEY", "a=b"]);
  });

  it("gerçek ortam değişkenlerini dosya değerleriyle EZMEZ", () => {
    const dir = mkdtempSync(join(tmpdir(), "selfhost-env-"));
    const file = join(dir, ".env");
    writeFileSync(file, "SUPABASE_URL=https://dosya.example\nOTHER=abc\n");
    const env: Record<string, string> = { SUPABASE_URL: "https://ortam.example" };
    loadEnvFile(file, env);
    expect(env.SUPABASE_URL).toBe("https://ortam.example");
    expect(env.OTHER).toBe("abc");
  });

  it("SUPABASE_* ve VITE_SUPABASE_* aynalamasını iki yönlü yapar", () => {
    const a = normalizeEnv({ VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" } as any);
    expect(a.SUPABASE_URL).toBe("u");
    expect(a.SUPABASE_PUBLISHABLE_KEY).toBe("k");

    const b = normalizeEnv({ SUPABASE_URL: "u2", SUPABASE_ANON_KEY: "k2" } as any);
    expect(b.VITE_SUPABASE_URL).toBe("u2");
    expect(b.SUPABASE_PUBLISHABLE_KEY).toBe("k2");
    expect(b.VITE_SUPABASE_PUBLISHABLE_KEY).toBe("k2");
  });

  it("service-role takma isimlerini normalize eder ve üretim varsayılanı atar", () => {
    const env = normalizeEnv({ SUPABASE_SECRET_KEY: "s" } as any);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("s");
    expect(env.NODE_ENV).toBe("production");
    expect(env.PORT).toBe("3000");
  });

  it("dışarıdan verilen PORT/NODE_ENV değerlerini ezmez", () => {
    const env = normalizeEnv({ PORT: "8080", NODE_ENV: "staging" } as any);
    expect(env.PORT).toBe("8080");
    expect(env.NODE_ENV).toBe("staging");
  });
});

describe("package.json ↔ package-lock.json senkronu", () => {
  it("npm ci'nin başarısız olacağı sürüm farkı yok", () => {
    const root = (lock as any).packages[""] ?? {};
    const diffs: string[] = [];
    for (const field of ["dependencies", "devDependencies"] as const) {
      const a = ((pkg as any)[field] ?? {}) as Record<string, string>;
      const b = (root[field] ?? {}) as Record<string, string>;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (a[k] !== b[k]) diffs.push(`${field}.${k}: package=${a[k]} lock=${b[k]}`);
      }
    }
    expect(diffs).toEqual([]);
  });

  it("kilit ağacında kritik paketler çözümlenmiş", () => {
    const packages = (lock as any).packages as Record<string, unknown>;
    for (const p of ["node_modules/vitest", "node_modules/vite", "node_modules/@supabase/supabase-js"]) {
      expect(packages[p], p).toBeTruthy();
    }
  });
});
