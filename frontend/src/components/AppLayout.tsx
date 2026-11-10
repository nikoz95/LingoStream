import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import LanguageToggle from './LanguageToggle';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  headerActions?: ReactNode;
}

export default function AppLayout({
  children,
  title,
  subtitle,
  showBack = false,
  backTo = '/library',
  headerActions,
}: AppLayoutProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const settings = useSettings();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      // ignore
    }
  };

  const navItems = [
    {
      to: '/library',
      label: t.navLibrary,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
    {
      to: '/writing',
      label: t.navWriting,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      ),
    },
    {
      to: '/vocabulary',
      label: t.navVocabulary,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-6" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      {/* Top Header */}
      <header
        className="sticky top-0 z-40 h-14 md:h-16 px-4 md:px-8 border-b transition-colors"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4">
          {/* Left brand / Back button */}
          <div className="flex items-center gap-3 min-w-0">
            {showBack && (
              <button
                onClick={() => navigate(backTo)}
                className="p-2 -ml-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--app-text-muted)' }}
                title={t.back}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            <div className="flex flex-col min-w-0">
              <span
                onClick={() => navigate('/library')}
                className="font-bold text-base md:text-lg tracking-tight cursor-pointer truncate"
                style={{ color: 'var(--app-text)' }}
              >
                LingoStream
              </span>
              {subtitle && (
                <span className="text-xs hidden lg:block truncate" style={{ color: 'var(--app-text-muted)' }}>
                  {subtitle}
                </span>
              )}
            </div>

            {title && (
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-sm font-medium truncate" style={{ color: 'var(--app-text)' }}>
                  {title}
                </span>
              </div>
            )}
          </div>

          {/* Desktop Segmented Navigation (Center) */}
          <nav
            className="hidden md:flex items-center p-1 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-canvas)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'shadow-xs font-semibold'
                      : 'hover:opacity-100'
                  }`
                }
                style={({ isActive }) => ({
                  backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--app-text)' : 'var(--app-text-muted)',
                  border: isActive ? '1px solid var(--border-strong)' : '1px solid transparent',
                })}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right Action Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}

            <LanguageToggle />

            <button
              onClick={settings.openSettings}
              className="p-2 rounded-lg border transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--app-text-muted)',
              }}
              title={t.navSettings}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <button
              onClick={handleLogout}
              className="p-2 md:px-3 md:py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--app-text-muted)',
              }}
              title={t.navSignOut}
            >
              <span className="hidden md:inline">{t.navSignOut}</span>
              <span className="md:hidden">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-5 md:py-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar (Thumb Friendly) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden h-16 border-t flex items-center justify-around px-2"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors ${
                isActive ? 'font-semibold' : 'opacity-70 hover:opacity-100'
              }`
            }
            style={({ isActive }) => ({
              color: isActive ? 'var(--app-accent)' : 'var(--app-text-muted)',
            })}
          >
            {item.icon}
            <span className="mt-1">{item.label}</span>
          </NavLink>
        ))}

        <button
          onClick={settings.openSettings}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium opacity-70 hover:opacity-100 transition-colors"
          style={{ color: 'var(--app-text-muted)' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="mt-1">{t.navSettings}</span>
        </button>
      </nav>
    </div>
  );
}
