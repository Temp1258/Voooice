import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const environment = (import.meta.env.VITE_APP_ENV as string) || 'development';
const release = (import.meta.env.VITE_APP_VERSION as string) || 'dev';
const isProduction = environment === 'production';

let initialized = false;

export function initSentry(): void {
  if (!DSN) {
    console.debug('[Sentry] No DSN provided, skipping initialization.');
    return;
  }

  if (initialized) {
    return;
  }

  const integrations: Sentry.Integration[] = [
    Sentry.browserTracingIntegration(),
  ];

  // Add Replay integration if available
  if (typeof Sentry.replayIntegration === 'function') {
    integrations.push(Sentry.replayIntegration());
  }

  Sentry.init({
    dsn: DSN,
    environment,
    release,
    integrations,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  initialized = true;
  console.debug(`[Sentry] Initialized (env=${environment}, release=${release})`);
}

/**
 * Whether Sentry has been successfully initialized.
 */
export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * Log an error to Sentry. No-op if Sentry is not initialized.
 */
export function captureError(
  error: Error | string,
  context?: Record<string, unknown>,
): void {
  if (!initialized) {
    console.error('[Sentry:noop] captureError:', error, context);
    return;
  }

  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      if (typeof error === 'string') {
        Sentry.captureMessage(error, 'error');
      } else {
        Sentry.captureException(error);
      }
    });
  } else {
    if (typeof error === 'string') {
      Sentry.captureMessage(error, 'error');
    } else {
      Sentry.captureException(error);
    }
  }
}

/**
 * Set the current user context in Sentry. Pass `null` to clear.
 */
export function setUser(
  user: { id: string; email?: string; username?: string } | null,
): void {
  if (!initialized) {
    return;
  }
  Sentry.setUser(user);
}

/**
 * Add a breadcrumb to the Sentry trail.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
): void {
  if (!initialized) {
    return;
  }
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

// Auto-initialize on import
initSentry();
