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
      // client bundle below ES2020 so optional chaining (?.), nullish
      // coalescing (??), and newer class syntax are transpiled before APK sync.
      target: ["chrome74", "safari13"],
      cssTarget: "chrome74",
      modulePreload: { polyfill: true },
    },
    esbuild: {
      target: "chrome74",
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "chrome74",
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
