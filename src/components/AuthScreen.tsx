import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../services/authService';
import { useI18n } from '../i18n';

interface AuthScreenProps {
  onContinueAsGuest: () => void;
}

export function AuthScreen({ onContinueAsGuest }: AuthScreenProps) {
  const { login, signup, loginAsGuest, loading } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch'));
        return;
      }
      const result = await signup(email, password, displayName);
      if (!result.success) {
        setError(result.error || t('auth.signupFailed'));
      }
    } else {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || t('auth.loginFailed'));
      }
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    await loginAsGuest();
    onContinueAsGuest();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <LogIn className="h-8 w-8 text-indigo-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Voooice</h1>
      </div>

      {/* Tabs */}
      <div className="bg-gray-200 rounded-xl p-1 flex w-full max-w-sm mb-6">
        <button
          onClick={() => { setMode('login'); setError(null); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {t('auth.login')}
        </button>
        <button
          onClick={() => { setMode('signup'); setError(null); }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {t('auth.signup')}
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Display name (signup only) */}
        {mode === 'signup' && (
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('auth.displayName')}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              required
              aria-label={t('auth.displayName')}
            />
          </div>
        )}

        {/* Email */}
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email')}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            required
            aria-label={t('auth.email')}
          />
        </div>

        {/* Password */}
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password')}
            className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            required
            aria-label={t('auth.password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        {/* Confirm password (signup only) */}
        {mode === 'signup' && (
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.confirmPassword')}
              className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              required
              aria-label={t('auth.confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        )}

        {/* Forgot password link (login only) */}
        {mode === 'login' && (
          <div className="text-right">
            <button
              type="button"
              className="text-sm text-indigo-600 active:text-indigo-800"
            >
              {t('auth.forgotPassword')}
            </button>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-semibold flex items-center justify-center space-x-2 disabled:opacity-50 active:bg-indigo-700 transition-colors"
        >
          {loading ? (
            <span>{t('common.loading')}</span>
          ) : (
            <>
              <LogIn className="h-5 w-5" />
              <span>{mode === 'login' ? t('auth.login') : t('auth.signup')}</span>
            </>
          )}
        </button>
      </form>

      {/* Divider + Guest login */}
      <div className="mt-6 w-full max-w-sm">
        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-gray-50 px-3 text-sm text-gray-400 absolute whitespace-nowrap">
            {/* Intentionally no i18n – universal separator */}
            &mdash;
          </span>
        </div>
        <button
          onClick={handleGuestLogin}
          disabled={loading}
          className="w-full bg-white border-2 border-gray-200 text-gray-700 rounded-xl py-3.5 font-semibold active:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {t('auth.continueAsGuest')}
        </button>
      </div>
    </div>
  );
}
