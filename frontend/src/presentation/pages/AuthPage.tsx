import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@infrastructure/store/authStore.ts';
import { BookOpen } from 'lucide-react';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch {
      // error is set in the store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-3xl p-8 backdrop-blur-xl"
        style={{
          backgroundColor: 'var(--ls-glass-bg)',
          border: '1px solid var(--ls-glass-border)',
          boxShadow: `0 8px 32px var(--ls-shadow)`,
        }}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ backgroundColor: 'var(--ls-accent)' }}>
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>
            LingoStream
          </h1>
          <p className="mt-2" style={{ color: 'var(--ls-text-secondary)' }}>
            Learn languages through reading
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--ls-text)' }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200"
              style={{
                backgroundColor: 'var(--ls-bg)',
                border: '1px solid var(--ls-border)',
                color: 'var(--ls-text)',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--ls-text)' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl outline-none transition-all duration-200"
              style={{
                backgroundColor: 'var(--ls-bg)',
                border: '1px solid var(--ls-border)',
                color: 'var(--ls-text)',
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl font-medium text-white transition-all duration-200 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--ls-accent)',
            }}
          >
            {isLoading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--ls-text-muted)' }}>
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              clearError();
            }}
            className="font-medium underline underline-offset-2 transition-colors"
            style={{ color: 'var(--ls-accent)' }}
          >
            {isLogin ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}