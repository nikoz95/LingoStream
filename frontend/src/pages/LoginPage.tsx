import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKGROUND_BLOBS = [
  'absolute -top-40 -right-40 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl',
  'absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-pink-500/10 blur-3xl',
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {BACKGROUND_BLOBS.map((className, i) => (
          <div key={i} className={className} />
        ))}
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            LingoStream
          </h1>
          <p className="mt-2 text-white/50 text-sm">
            AI-Powered Reading for Language Acquisition
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 
                  text-white placeholder:text-white/30 
                  focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50
                  transition-all duration-200"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-1.5">
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
                className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 
                  text-white placeholder:text-white/30 
                  focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/50
                  transition-all duration-200"
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-medium
                disabled:opacity-50 disabled:cursor-not-allowed
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
              className="text-sm text-white/50 hover:text-white transition-colors underline underline-offset-2"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}