// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      // Android 10 / early Huawei WebView can be Chromium 74-79. Keep the
      // client bundle at ES2017 so optional chaining (?.), nullish coalescing
      // (??), optional catch binding, and private fields are removed before APK sync.
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
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
