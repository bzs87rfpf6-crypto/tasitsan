// Taşıtsan service worker — push notifications + safe activation
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      payload = { title: "Taşıtsan", body: event.data ? event.data.text() : "" };
    } catch (__) {
      payload = {};
    }
  }
  const title = payload.title || "Taşıtsan";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || ("tasitsan-" + Date.now()),
    data: { url: payload.url || "/admin" },
    requireInteraction: payload.priority === "high",
    vibrate: payload.priority === "high" ? [200, 80, 200, 80, 400] : [120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        try {
          const url = new URL(w.url);
          if (url.origin === self.location.origin) {
            w.focus();
            w.navigate(target);
            return;
          }
        } catch (_) {}
      }
      return self.clients.openWindow(target);
    }),
  );
});
