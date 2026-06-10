const CACHE_NAME = "clockin-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.ts",
  "/favicon.ico",
  "/icon-192x192.png",
  "/icon-512x512.png"
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First falling back to Cache
self.addEventListener("fetch", (event) => {
  // Ignore non-GET requests (e.g. POST for actions/mutations) and Chrome Extensions
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response and cache it
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If a page route fails, we can return a basic offline fallback response
          if (event.request.mode === "navigate") {
            return new Response(
              `<!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Offline - ClockIn</title>
                <style>
                  body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #fff; text-align: center; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                  h1 { color: #f43f5e; margin-bottom: 0.5rem; }
                  p { color: #a1a1aa; margin-bottom: 1.5rem; }
                  .btn { background: #6366f1; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; text-decoration: none; font-weight: 600; }
                </style>
              </head>
              <body>
                <h1>You are offline</h1>
                <p>Check your internet connection. We will sync any clock-in actions as soon as you reconnect.</p>
                <button class="btn" onclick="window.location.reload()">Retry Connection</button>
              </body>
              </html>`,
              { headers: { "Content-Type": "text/html" } }
            );
          }
        });
      })
  );
});

// Push Notification Event
self.addEventListener("push", (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: data.icon || "/icon-192x192.png",
        badge: "/icon-192x192.png",
        vibrate: [100, 50, 100],
        data: {
          url: data.url || "/"
        }
      };
      event.waitUntil(
        self.registration.showNotification(data.title || "Clock-In System", options)
      );
    } catch (e) {
      // If event.data is not JSON, treat it as plain text
      const options = {
        body: event.data.text(),
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        vibrate: [100, 50, 100],
        data: {
          url: "/"
        }
      };
      event.waitUntil(
        self.registration.showNotification("Clock-In System Notification", options)
      );
    }
  }
});

// Notification Click Event
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If window client is open, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // If no open window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
