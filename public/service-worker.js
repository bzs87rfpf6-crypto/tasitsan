function isWorkboxCacheForThisRegistration(name) {
  var hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  return hasWorkboxBucket && name.indexOf(self.registration.scope, name.length - self.registration.scope.length) !== -1;
}

function settleAll(promises) {
  return Promise.all(
    promises.map(function (promise) {
      return Promise.resolve(promise).catch(function () {
        return undefined;
      });
    }),
  );
}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return settleAll(cacheNames.filter(isWorkboxCacheForThisRegistration).map(function (name) {
          return caches.delete(name);
        }));
      })
      .then(function () {
        return self.clients.claim();
      })
      .then(function () {
        return self.clients.matchAll({ type: "window" });
      })
      .then(function (windowClients) {
        return settleAll(windowClients.map(function (client) {
          return client.navigate(client.url);
        }));
      })
      .catch(function () {
        return undefined;
      })
      .then(function () {
        return self.registration.unregister();
      }),
  );
});