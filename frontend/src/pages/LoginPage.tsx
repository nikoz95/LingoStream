import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKGROUND_BLOBS = [
  'absolute -top-40 -right-40 w-96 h-96 rounded-full bg-amber-200/20 blur-3xl',
  'absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-amber-300/20 blur-3xl',
];

export default function LoginPage() {
  const { login, register } = useAuth();
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
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen theme-sepia flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {BACKGROUND_BLOBS.map((className, i) => (
          <div key={i} className={className} />
        ))}
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-sepia-text">
            LingoStream
          </h1>
          <p className="mt-2 text-sepia-text/60 text-sm">
            AI-Powered Reading for Language Acquisition
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-sepia-text mb-6">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-sepia-text/80 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-sepia-text/15 bg-white/50 
                  text-sepia-text placeholder:text-sepia-text/30 
                  focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50
                  transition-all duration-200"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-sepia-text/80 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-4 py-2.5 rounded-xl border border-sepia-text/15 bg-white/50 
                  text-sepia-text placeholder:text-sepia-text/30 
                  focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50
                  transition-all duration-200"
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-sepia-text text-sepia-bg font-medium
                hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-sm"
            >
              {loading ? (
                <LoadingSpinner
                  message={isRegister ? 'Creating account...' : 'Signing in...'}
                  light
                  inline
                />
              ) : (
                isRegister ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-sm text-sepia-text/60 hover:text-sepia-text transition-colors underline underline-offset-2"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}