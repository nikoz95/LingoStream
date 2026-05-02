export type ThemeId = 'sepia' | 'deepNight';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  bg: string;
  bgCard: string;
  bgHover: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  border: string;
  glassBg: string;
  glassBorder: string;
  shadow: string;
}

export const themes: Record<ThemeId, ThemeConfig> = {
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    bg: '#F4ECD8',
    bgCard: '#EBE0C9',
    bgHover: '#E0D4B8',
    text: '#433422',
    textSecondary: '#6B5D4A',
    textMuted: '#9C8B75',
    accent: '#8B5E3C',
    accentHover: '#6F4E32',
    border: '#D4C8A8',
    glassBg: 'rgba(235, 224, 201, 0.8)',
    glassBorder: 'rgba(212, 200, 168, 0.3)',
    shadow: 'rgba(67, 52, 34, 0.08)',
  },
  deepNight: {
    id: 'deepNight',
    name: 'Deep Night',
    bg: '#1A1B1E',
    bgCard: '#232529',
    bgHover: '#2C2E33',
    text: '#E8E9ED',
    textSecondary: '#A0A2A8',
    textMuted: '#6B6D73',
    accent: '#7AA2E7',
    accentHover: '#5B8AD6',
    border: '#36383E',
    glassBg: 'rgba(35, 37, 41, 0.85)',
    glassBorder: 'rgba(54, 56, 62, 0.4)',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
};

export function getThemeVars(theme: ThemeConfig): Record<string, string> {
  return {
    '--ls-bg': theme.bg,
    '--ls-bg-card': theme.bgCard,
    '--ls-bg-hover': theme.bgHover,
    '--ls-text': theme.text,
    '--ls-text-secondary': theme.textSecondary,
    '--ls-text-muted': theme.textMuted,
    '--ls-accent': theme.accent,
    '--ls-accent-hover': theme.accentHover,
    '--ls-border': theme.border,
    '--ls-glass-bg': theme.glassBg,
    '--ls-glass-border': theme.glassBorder,
    '--ls-shadow': theme.shadow,
  };
}