import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { UserProfile, AuthState } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  token?: string;
  error?: string;
}

export interface AuthProviderInterface {
  login(email: string, password: string): Promise<AuthResult>;
  signup(email: string, password: string, displayName: string): Promise<AuthResult>;
  logout(): Promise<void>;
  getSession(): Promise<AuthState>;
  refreshToken(): Promise<string>;
  resetPassword(email: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'voooice_token';
const TOKEN_EXPIRY_KEY = 'voooice_token_expires';
const USER_KEY = 'voooice_user';

function storeToken(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
  } catch {
    // localStorage unavailable
  }
}

function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!token || !expiry) return null;
    if (Date.now() > Number(expiry)) {
      clearStoredAuth();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

function getTokenExpiry(): number | null {
  try {
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    return expiry ? Number(expiry) : null;
  } catch {
    return null;
  }
}

function storeUser(user: UserProfile): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Cloud auth provider (calls REST API)
// ---------------------------------------------------------------------------

import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api/auth`;

export class CloudAuthProvider implements AuthProviderInterface {
  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Login failed' };
      storeToken(data.token, data.expiresAt);
      storeUser(data.user);
      return { success: true, user: data.user, token: data.token };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async signup(email: string, password: string, displayName: string): Promise<AuthResult> {
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Signup failed' };
      storeToken(data.token, data.expiresAt);
      storeUser(data.user);
      return { success: true, user: data.user, token: data.token };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async logout(): Promise<void> {
    const token = getStoredToken();
    if (token) {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearStoredAuth();
  }

  async getSession(): Promise<AuthState> {
    const token = getStoredToken();
    const user = getStoredUser();
    if (!token) {
      return { isAuthenticated: false, user: null, token: null, loading: false };
    }
    // If we have a cached user, return it immediately
    if (user) {
      return { isAuthenticated: true, user, token, loading: false };
    }
    // Otherwise try to fetch from server
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const fetchedUser: UserProfile = await res.json();
      storeUser(fetchedUser);
      return { isAuthenticated: true, user: fetchedUser, token, loading: false };
    } catch {
      clearStoredAuth();
      return { isAuthenticated: false, user: null, token: null, loading: false };
    }
  }

  async refreshToken(): Promise<string> {
    const token = getStoredToken();
    if (!token) throw new Error('No token to refresh');
    const res = await fetch(`${API_BASE}/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearStoredAuth();
      throw new Error('Token refresh failed');
    }
    const data = await res.json();
    storeToken(data.token, data.expiresAt);
    return data.token;
  }

  async resetPassword(email: string): Promise<void> {
    const res = await fetch(`${API_BASE}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Password reset failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Local/guest auth provider (demo/offline mode)
// ---------------------------------------------------------------------------

const GUEST_USER_KEY = 'voooice_guest_user';

export class LocalAuthProvider implements AuthProviderInterface {
  async login(_email: string, _password: string): Promise<AuthResult> {
    const user = this.getOrCreateGuestUser();
    storeToken('local', Date.now() + 365 * 24 * 3600_000);
    return { success: true, user, token: 'local' };
  }

  async signup(_email: string, _password: string, displayName: string): Promise<AuthResult> {
    const user: UserProfile = {
      id: `local-${Date.now()}`,
      email: 'guest@voooice.local',
      displayName: displayName || 'Guest',
      avatarUrl: '',
      plan: 'free',
      voiceQuota: 10,
      usedQuota: 0,
    };
    localStorage.setItem(GUEST_USER_KEY, JSON.stringify(user));
    storeToken('local', Date.now() + 365 * 24 * 3600_000);
    return { success: true, user, token: 'local' };
  }

  async logout(): Promise<void> {
    localStorage.removeItem(GUEST_USER_KEY);
    clearStoredAuth();
  }

  async getSession(): Promise<AuthState> {
    const stored = localStorage.getItem(GUEST_USER_KEY);
    if (stored) {
      const user = JSON.parse(stored) as UserProfile;
      return { isAuthenticated: true, user, token: 'local', loading: false };
    }
    return { isAuthenticated: false, user: null, token: null, loading: false };
  }

  async refreshToken(): Promise<string> {
    storeToken('local', Date.now() + 365 * 24 * 3600_000);
    return 'local';
  }

  async resetPassword(_email: string): Promise<void> {
    // No-op in local mode
  }

  private getOrCreateGuestUser(): UserProfile {
    const stored = localStorage.getItem(GUEST_USER_KEY);
    if (stored) return JSON.parse(stored);
    const user: UserProfile = {
      id: `local-${Date.now()}`,
      email: 'guest@voooice.local',
      displayName: 'Guest',
      avatarUrl: '',
      plan: 'free',
      voiceQuota: 10,
      usedQuota: 0,
    };
    localStorage.setItem(GUEST_USER_KEY, JSON.stringify(user));
    return user;
  }
}

// ---------------------------------------------------------------------------
// React context + hook
// ---------------------------------------------------------------------------

interface AuthContextValue {
  authState: AuthState;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string, displayName: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  loginAsGuest: () => Promise<AuthResult>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const cloudProvider = new CloudAuthProvider();
const localProvider = new LocalAuthProvider();

/** How often to check whether the token needs refreshing (ms). */
const REFRESH_CHECK_INTERVAL = 60_000;
/** Refresh the token this many ms before it actually expires. */
const REFRESH_BUFFER = 5 * 60_000;

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
  });
  const [loading, setLoading] = useState(false);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      // Try cloud session first, then local
      let session = await cloudProvider.getSession();
      if (!session.isAuthenticated) {
        session = await localProvider.getSession();
      }
      setAuthState({ ...session, loading: false });
    })();
  }, []);

  // Auto-refresh token when close to expiry
  useEffect(() => {
    if (!authState.isAuthenticated || !authState.token) return;
    if (authState.token === 'local') return; // skip for local tokens

    const interval = setInterval(async () => {
      try {
        const expiry = getTokenExpiry();
        if (expiry && Date.now() + REFRESH_BUFFER >= expiry) {
          const newToken = await cloudProvider.refreshToken();
          setAuthState(prev => ({ ...prev, token: newToken }));
        }
      } catch {
        setAuthState({
          isAuthenticated: false,
          user: null,
          token: null,
          loading: false,
        });
      }
    }, REFRESH_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [authState.isAuthenticated, authState.token]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const result = await cloudProvider.login(email, password);
    if (result.success && result.user) {
      setAuthState({
        isAuthenticated: true,
        user: result.user,
        token: result.token ?? null,
        loading: false,
      });
    }
    setLoading(false);
    return result;
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    setLoading(true);
    const result = await cloudProvider.signup(email, password, displayName);
    if (result.success && result.user) {
      setAuthState({
        isAuthenticated: true,
        user: result.user,
        token: result.token ?? null,
        loading: false,
      });
    }
    setLoading(false);
    return result;
  }, []);

  const logout = useCallback(async () => {
    const isLocal = authState.token === 'local';
    if (isLocal) {
      await localProvider.logout();
    } else {
      await cloudProvider.logout();
    }
    setAuthState({ isAuthenticated: false, user: null, token: null, loading: false });
  }, [authState.token]);

  const loginAsGuest = useCallback(async () => {
    setLoading(true);
    const result = await localProvider.login('', '');
    if (result.success && result.user) {
      setAuthState({
        isAuthenticated: true,
        user: result.user,
        token: 'local',
        loading: false,
      });
    }
    setLoading(false);
    return result;
  }, []);

  const value = useMemo(
    () => ({ authState, login, signup, logout, loginAsGuest, loading }),
    [authState, login, signup, logout, loginAsGuest, loading],
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthContextProvider');
  return ctx;
}
