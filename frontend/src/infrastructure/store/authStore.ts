import { create } from 'zustand';
import type { AuthTokens } from '@domain/entities/index.ts';
import { api } from '@infrastructure/api/client.ts';

interface AuthState {
  tokens: AuthTokens | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  tokens: (() => {
    const stored = localStorage.getItem('lingostream_tokens');
    if (stored) {
      try {
        return JSON.parse(stored) as AuthTokens;
      } catch {
        return null;
      }
    }
    return null;
  })(),

  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await api.login(email, password);
      localStorage.setItem('lingostream_tokens', JSON.stringify(tokens));
      set({ tokens, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
      throw err;
    }
  },

  register: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await api.register(email, password);
      localStorage.setItem('lingostream_tokens', JSON.stringify(tokens));
      set({ tokens, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('lingostream_tokens');
    set({ tokens: null });
  },

  isAuthenticated: () => {
    return get().tokens !== null;
  },

  clearError: () => set({ error: null }),
}));