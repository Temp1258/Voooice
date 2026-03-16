/// <reference lib="webworker" />

const CACHE_NAME = 'vocaltext-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.eot'];

/**
 * Determine if a request URL is for a static asset.
 */
function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

/**
 * Determine if a request is an API call.
 */
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

/**
 * Determine if a request is a navigation request.
 */
function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  );
}

// ─── Install: precache app shell ─────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

// ─── Activate: clean old caches ──────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Claim all open clients so the new SW takes effect immediately
  self.clients.claim();
});

// ─── Fetch: routing strategies ───────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Strategy: Cache-first for static assets
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((networkResponse) => {
          // Cache the new static asset for next time
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Strategy: Network-first for API calls
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Optionally cache successful GET API responses
          if (event.request.method === 'GET' && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback to cache when offline
          return caches.match(event.request);
        })
    );
    return;
  }

  // Offline fallback: return cached index.html for navigation requests
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }
});

// ─── Background sync for pending voice uploads ──────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'voice-upload-sync') {
    event.waitUntil(processPendingUploads());
  }
});

async function processPendingUploads() {
  try {
    // Open IndexedDB to get pending uploads
    // This is a placeholder — actual implementation would read from IDB
    console.log('[SW] Processing pending voice uploads via background sync');

    // Example flow:
    // 1. Read pending uploads from IndexedDB
    // 2. POST each to the server
    // 3. Remove from pending queue on success
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    throw error; // Throwing causes the sync to be retried
  }
}

// ─── Message handling ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
