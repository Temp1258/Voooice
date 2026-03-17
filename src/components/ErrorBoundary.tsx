import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { t as standaloneT, type Locale } from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onNavigateHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // In production, send to error tracking service (e.g. Sentry)
    // errorTrackingService.captureException(error, { extra: errorInfo });
  }

  private getLocale(): Locale {
    try {
      const stored = localStorage.getItem('voooice-locale');
      if (stored === 'zh-CN' || stored === 'en-US') return stored;
    } catch {}
    return 'zh-CN';
  }

  private t = (key: string, params?: Record<string, string>): string => {
    return standaloneT(this.getLocale(), key, params);
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleNavigateHome = () => {
    this.setState({ hasError: false, error: null });
    this.props.onNavigateHome?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
            {/* Error icon */}
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900 mb-2">{this.t('error.title')}</h2>

            {/* Error message */}
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              {this.state.error?.message || this.t('error.defaultMessage')}
            </p>

            {/* Error details (collapsed in production) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500">
                  {this.t('error.viewDetails')}
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 overflow-auto max-h-32">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 active:bg-indigo-700 transition-colors"
              >
                <RotateCcw className="h-5 w-5" />
                <span>{this.t('common.retry')}</span>
              </button>

              <button
                onClick={this.handleNavigateHome}
                className="w-full bg-gray-100 text-gray-700 rounded-xl py-3 font-semibold flex items-center justify-center space-x-2 active:bg-gray-200 transition-colors"
              >
                <Home className="h-5 w-5" />
                <span>{this.t('error.goHome')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
