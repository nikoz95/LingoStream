import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/i18n';
import LanguageToggle from '../components/LanguageToggle';
import LoadingSpinner from '../components/LoadingSpinner';

export default function LoginPage() {
  const { login, register } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      navigate('/library', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ka' ? 'ავტორიზაცია ვერ მოხერხდა' : 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 transition-colors"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--app-accent)',
            }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--app-text)' }}>
            LingoStream
          </h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            {lang === 'ka' ? 'ინტელექტუალური კითხვა და ენის შესწავლა' : 'AI-Powered Reading & Language Practice'}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 sm:p-7 border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--app-text)' }}>
            {isRegister
              ? (lang === 'ka' ? 'ახალი ანგარიშის შექმნა' : 'Create an Account')
              : (lang === 'ka' ? 'სისტემაში შესვლა' : 'Sign in to LingoStream')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {lang === 'ka' ? 'ელ-ფოსტა' : 'Email'}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--app-text)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {lang === 'ka' ? 'პაროლი' : 'Password'}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={lang === 'ka' ? 'მინიმუმ 6 სიმბოლო' : 'Min. 6 characters'}
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--app-text)',
                }}
              />
            </div>

            {error && (
              <div
                className="text-xs p-3 rounded-xl border"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              style={{
                backgroundColor: 'var(--app-accent)',
                color: '#ffffff',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading && <LoadingSpinner message="" />}
              <span>
                {isRegister
                  ? (lang === 'ka' ? 'რეგისტრაცია' : 'Create Account')
                  : (lang === 'ka' ? 'შესვლა' : 'Sign In')}
              </span>
            </button>
          </form>

          {/* Toggle register / login */}
          <div className="mt-5 pt-4 text-center border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {isRegister
                ? (lang === 'ka' ? 'უკვე გაქვს ანგარიში? შესვლა' : 'Already have an account? Sign In')
                : (lang === 'ka' ? 'ახალი ხარ? გაიარე რეგისტრაცია' : "Don't have an account? Sign Up")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
