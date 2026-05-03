import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { StoredUser } from './api';
import {
  getStoredUser,
  saveTokens,
  clearTokens,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getMe,
} from './api';

interface AuthContextType {
  user: StoredUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(getStoredUser());
  const [isLoading, setIsLoading] = useState(true);

  const validateToken = useCallback(async () => {
    const stored = getStoredUser();
    if (!stored) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await getMe();
      setUser(me);
    } catch {
      // Token expired or invalid
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    validateToken();
  }, [validateToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    saveTokens(res.access_token, res.refresh_token, res.user);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiRegister(email, password);
    saveTokens(res.access_token, res.refresh_token, res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore server errors on logout
    }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}