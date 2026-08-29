// Self-host (VPS / Docker) build config — Lovable Cloud kurulumundan tamamen bağımsız.
//
// vite.config.ts (Lovable Cloud önizleme + yayın) DEĞİŞTİRİLMEZ. Bu dosya yalnızca
// `bun run build:selfhost` ile kullanılır ve Nitro'nun `node-server` preset'i ile
// .output/server/index.mjs üretir (Cloudflare Workers yerine düz Node).
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import path from "node:path";

export default defineConfig({
  // Self-host işareti: CDN (/__l5e/...) yolları yerine public/ altındaki
  // yerel dosyalar kullanılır. Script zaten VITE_SELFHOST=true veriyor.
  define: {
    "import.meta.env.VITE_SELFHOST": JSON.stringify(
      process.env["VITE_SELFHOST"] ?? "true",
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts — SSR hata sarmalayıcımız; Nitro bundan build alır.
      server: { entry: "server" },
    }),
    nitro({
      preset: "node-server",
      compatibilityDate: "2025-01-01",
    }),
    viteReact(),
  ],
  build: {
    // Capacitor/Android WebView uyumu için Lovable config'iyle aynı hedefler.
    target: "es2017",
    cssTarget: "chrome61",
    modulePreload: { polyfill: true },
  },
  esbuild: {
    target: "es2017",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2017",
    },
  },
});
