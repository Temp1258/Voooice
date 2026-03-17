/**
 * Service Worker registration utility.
 *
 * Call `registerServiceWorker()` once at app startup (e.g. in main.tsx).
 * It handles:
 *  - Feature-detection for SW support
 *  - Initial registration
 *  - Update detection with user prompt
 */

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers are not supported in this browser.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[SW] Registered with scope:', registration.scope);

    // Check for updates on registration
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          // A new SW is installed but waiting to activate —
          // this means there is an update available.
          showUpdatePrompt(newWorker);
        }
      });
    });

    // Also handle the case where the page is controlled by an older SW
    // and a new one is already waiting.
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdatePrompt(registration.waiting);
    }
  } catch (error) {
    console.error('[SW] Registration failed:', error);
  }
}

/**
 * Display a prompt to the user when a new version of the app is available.
 * If confirmed, tell the waiting SW to skip waiting and reload the page.
 */
function showUpdatePrompt(waitingWorker: ServiceWorker): void {
  // You can replace this with a custom in-app toast / banner.
  const shouldUpdate = window.confirm(
    '新版本已可用，是否立即更新？'
  );

  if (shouldUpdate) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    // Reload once the new SW takes over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
}
