/// <reference lib="webworker" />

const CACHE_NAME = 'voooice-v1';
const PENDING_UPLOADS_STORE = 'pendingUploads';
const DB_NAME = 'VoooiceDB';
const DB_VERSION = 2;

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg',
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

  // Intercept failed audio upload POSTs and queue them for background sync
  if (isApiRequest(url) && event.request.method === 'POST' && url.pathname.startsWith('/api/audio/')) {
    event.respondWith(
      fetch(event.request.clone())
        .catch(async () => {
          // Network failed — queue the upload for background sync
          const body = await event.request.arrayBuffer();
          const contentType = event.request.headers.get('content-type') || 'application/octet-stream';
          await queuePendingUpload({
            id: url.pathname.split('/').pop(),
            url: event.request.url,
            body: body,
            contentType: contentType,
            timestamp: Date.now(),
          });

          // Register for background sync
          if (self.registration && 'sync' in self.registration) {
            try {
              await self.registration.sync.register('voice-upload-sync');
            } catch (err) {
              console.warn('[SW] Background sync registration failed:', err);
            }
          }

          return new Response(JSON.stringify({ queued: true }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

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

// ─── IndexedDB helpers for the pending uploads queue ─────────────────────────

/**
 * Open the app's IndexedDB, ensuring the pendingUploads store exists.
 * We use a separate DB version namespace to avoid conflicts with the
 * main app DB migrations — instead we open VoooiceDB at the current
 * version and create the store only if it doesn't exist during upgrades.
 *
 * For simplicity in the SW context (which cannot import the app's openDB),
 * we use a dedicated lightweight DB for the upload queue.
 */
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VoooiceSyncDB', 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_UPLOADS_STORE)) {
        db.createObjectStore(PENDING_UPLOADS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Queue an upload for later retry via background sync.
 */
async function queuePendingUpload(upload) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_UPLOADS_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_UPLOADS_STORE);
    store.put(upload);
    tx.oncomplete = () => {
      console.log('[SW] Queued pending upload:', upload.id);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve all pending uploads from IndexedDB.
 */
async function getAllPendingUploads() {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_UPLOADS_STORE, 'readonly');
    const store = tx.objectStore(PENDING_UPLOADS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove a successfully uploaded item from the pending queue.
 */
async function removePendingUpload(id) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_UPLOADS_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_UPLOADS_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Process pending uploads (called by background sync) ─────────────────────

async function processPendingUploads() {
  try {
    const pendingUploads = await getAllPendingUploads();

    if (pendingUploads.length === 0) {
      console.log('[SW] No pending uploads to process');
      return;
    }

    console.log(`[SW] Processing ${pendingUploads.length} pending upload(s)`);

    const results = await Promise.allSettled(
      pendingUploads.map(async (upload) => {
        const response = await fetch(upload.url, {
          method: 'POST',
          headers: {
            'Content-Type': upload.contentType,
          },
          body: upload.body,
        });

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        // Success — remove from the pending queue
        await removePendingUpload(upload.id);
        console.log('[SW] Successfully uploaded:', upload.id);
      })
    );

    // If any uploads failed, throw so the sync event retries
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[SW] ${failures.length} upload(s) still failed, will retry`);
      throw new Error(`${failures.length} upload(s) failed during background sync`);
    }

    console.log('[SW] All pending uploads processed successfully');

    // Notify clients that sync completed
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'SYNC_COMPLETE', count: pendingUploads.length });
    });
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    throw error; // Throwing causes the sync to be retried by the browser
  }
}

// ─── Message handling ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Allow clients to manually trigger sync processing
  if (event.data && event.data.type === 'RETRY_UPLOADS') {
    event.waitUntil(processPendingUploads());
  }
});
