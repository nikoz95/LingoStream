import { useEffect, type ReactNode } from 'react';
import { useThemeStore } from '@infrastructure/store/themeStore.ts';

interface RootLayoutProps {
  children: ReactNode;
}

export function RootLayout({ children }: RootLayoutProps) {
  const cssVars = useThemeStore((s) => s.cssVars);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [cssVars]);

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{
        backgroundColor: 'var(--ls-bg)',
        color: 'var(--ls-text)',
      }}
    >
      {children}
    </div>
  );
}