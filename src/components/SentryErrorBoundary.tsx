import React from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RotateCcw, Home, MessageCircle } from 'lucide-react';
import { isSentryInitialized, captureError } from '../lib/sentry';
import { ErrorBoundary as AppErrorBoundary } from './ErrorBoundary';

interface SentryErrorBoundaryProps {
  children: React.ReactNode;
  onNavigateHome?: () => void;
}

/**
 * A user-friendly fallback UI shown when an error is caught.
 */
function ErrorFallback({
  error,
  resetError,
  onNavigateHome,
}: {
  error: Error;
  resetError: () => void;
  onNavigateHome?: () => void;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [feedbackSent, setFeedbackSent] = React.useState(false);

  const handleReportFeedback = () => {
    if (isSentryInitialized()) {
      const eventId = Sentry.lastEventId();
      if (eventId) {
        Sentry.showReportDialog({ eventId });
        setFeedbackSent(true);
      }
    }
  };

  const handleGoHome = () => {
    resetError();
    onNavigateHome?.();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        {/* Error icon */}
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Something went wrong
        </h2>

        {/* Error message */}
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          An unexpected error occurred. The error has been reported and we will
          look into it.
        </p>

        {/* Error details (collapsible) */}
        {error && (
          <div className="mb-6 text-left">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-gray-400 cursor-pointer hover:text-gray-500"
            >
              {showDetails ? 'Hide details' : 'View details'}
            </button>
            {showDetails && (
              <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 overflow-auto max-h-32">
                {error.message}
                {'\n'}
                {error.stack}
              </pre>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={resetError}
            className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 active:bg-indigo-700 transition-colors"
          >
            <RotateCcw className="h-5 w-5" />
            <span>Try again</span>
          </button>

          <button
            onClick={handleGoHome}
            className="w-full bg-gray-100 text-gray-700 rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 active:bg-gray-200 transition-colors"
          >
            <Home className="h-5 w-5" />
            <span>Go home</span>
          </button>

          {isSentryInitialized() && !feedbackSent && (
            <button
              onClick={handleReportFeedback}
              className="w-full bg-white border border-gray-200 text-gray-600 rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 active:bg-gray-50 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              <span>Report feedback</span>
            </button>
          )}

          {feedbackSent && (
            <p className="text-xs text-green-600">
              Thank you for your feedback!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SentryErrorBoundary wraps @sentry/react's ErrorBoundary when Sentry is
 * initialized. Otherwise it falls back to the existing application
 * ErrorBoundary so the app always has error protection regardless of
 * whether Sentry is configured.
 */
export function SentryErrorBoundary({
  children,
  onNavigateHome,
}: SentryErrorBoundaryProps) {
  if (isSentryInitialized()) {
    return (
      <Sentry.ErrorBoundary
        fallback={({ error, resetError }) => (
          <ErrorFallback
            error={error as Error}
            resetError={resetError}
            onNavigateHome={onNavigateHome}
          />
        )}
        beforeCapture={(scope) => {
          scope.setTag('boundary', 'sentry-error-boundary');
        }}
        onError={(error) => {
          captureError(error as Error, {
            source: 'SentryErrorBoundary',
          });
        }}
      >
        {children}
      </Sentry.ErrorBoundary>
    );
  }

  // Fallback to the existing ErrorBoundary when Sentry is not initialized
  return (
    <AppErrorBoundary onNavigateHome={onNavigateHome}>
      {children}
    </AppErrorBoundary>
  );
}
