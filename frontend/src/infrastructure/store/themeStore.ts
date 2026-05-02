import { create } from 'zustand';
import { type ThemeId, themes, getThemeVars } from '@infrastructure/themes/index.ts';

interface ThemeState {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  cssVars: Record<string, string>;
}

export const useThemeStore = create<ThemeState>((set) => {
  const stored = (localStorage.getItem('lingostream_theme') as ThemeId) || 'sepia';
  const initialTheme = themes[stored] || themes.sepia;

  return {
    themeId: initialTheme.id,
    cssVars: getThemeVars(initialTheme),
    setTheme: (id: ThemeId) => {
      localStorage.setItem('lingostream_theme', id);
      const theme = themes[id];
      set({ themeId: id, cssVars: getThemeVars(theme) });
    },
  };
});