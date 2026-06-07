import { useEffect } from "react";

import { reportLovableError } from "@/lib/lovable-error-reporting";

type LaunchErrorRecord = {
  type?: string;
  message?: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  at?: number;
};

declare global {
  interface Window {
    __tasitsanLaunchErrors?: LaunchErrorRecord[];
    __tasitsanPwaBootReported?: boolean;
  }
}

function isStandaloneLaunch() {
  const hasStandaloneMedia = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches
    : false;
  return (
    hasStandaloneMedia ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function settleAll(promises: Array<Promise<unknown>>) {
  return Promise.all(promises.map((promise) => promise.catch(() => undefined)));
}

function isBlankLaunchFrame() {
  const appText = ((document.body && document.body.innerText) || "").trim();
  const appRoot = document.querySelector("main, header, nav, [data-pwa-ready='true']");
  const hasEnoughText = appText.length > 20;
  return !appRoot && !hasEnoughText;
}

async function cleanupStaleAppShellCaches() {
  if (!("caches" in window)) return;
  const cacheNames = await caches.keys();
  const staleCaches = cacheNames.filter((name) => /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name));
  await settleAll(staleCaches.map((name) => caches.delete(name)));
}

async function cleanupStaleAppShellWorkers() {
  if (!("serviceWorker" in navigator) || typeof navigator.serviceWorker.getRegistrations !== "function") return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const staleWorkers = registrations.filter((registration) => {
    const activeURL = registration.active ? registration.active.scriptURL : "";
    const installingURL = registration.installing ? registration.installing.scriptURL : "";
    const waitingURL = registration.waiting ? registration.waiting.scriptURL : "";
    const scriptURL = activeURL || installingURL || waitingURL;
    return scriptURL.endsWith("/service-worker.js");
  });
  await settleAll(staleWorkers.map((registration) => registration.unregister()));
}

export function PwaLaunchDiagnostics() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    document.documentElement.setAttribute("data-pwa-hydrated", "true");

    const standalone = isStandaloneLaunch();
    console.info("[Taşıtsan PWA] launch", {
      standalone,
      startUrl: window.location.pathname + window.location.search + window.location.hash,
      displayMode: standalone ? "standalone" : "browser",
      userAgent: navigator.userAgent,
    });

    Promise.all([cleanupStaleAppShellWorkers(), cleanupStaleAppShellCaches()]).catch((error) => {
      console.error("[Taşıtsan PWA] service worker cleanup failed", error);
      reportLovableError(error, { source: "pwa_launch", phase: "service_worker_cleanup" });
    });

    const queuedErrors = window.__tasitsanLaunchErrors ?? [];
    for (const item of queuedErrors) {
      const error = new Error(item.message || "PWA startup error");
      if (item.stack) error.stack = item.stack;
      console.error("[Taşıtsan PWA] startup error", item);
      reportLovableError(error, { source: "pwa_launch", phase: "early_startup", ...item });
    }

    const blankScreenTimer = window.setTimeout(() => {
      if (!standalone || window.__tasitsanPwaBootReported || !isBlankLaunchFrame()) return;
      window.__tasitsanPwaBootReported = true;
      const error = new Error("PWA standalone launch rendered a blank screen");
      console.error("[Taşıtsan PWA] blank screen detected", {
        path: window.location.href,
        bodyTextLength: ((document.body && document.body.innerText) || "").trim().length,
        userAgent: navigator.userAgent,
      });
      reportLovableError(error, {
        source: "pwa_launch",
        phase: "blank_screen_watchdog",
        standalone: true,
        path: window.location.href,
        userAgent: navigator.userAgent,
      });
    }, 4500);

    return () => window.clearTimeout(blankScreenTimer);
  }, []);

  return null;
}