import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { EpubFontFamily } from './reader/EpubEngine';
import type { CefrLevel } from './api';

export type AppTheme = 'cosmic' | 'sepia' | 'light' | 'midnight' | 'emerald';
export type AiProvider = 'gemini' | 'deepseek' | 'openai' | 'local';

export interface SettingsState {
  theme: AppTheme;
  targetCefr: CefrLevel;
  customTopics: string[];
  readerFontFamily: EpubFontFamily;
  readerFontSize: number;
  translationEngine: string;
  targetLang: string;
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl: string;
}

export interface SettingsContextType extends SettingsState {
  setTheme: (theme: AppTheme) => void;
  setTargetCefr: (level: CefrLevel) => void;
  addCustomTopic: (topic: string) => boolean;
  removeCustomTopic: (topic: string) => void;
  setReaderFontFamily: (font: EpubFontFamily) => void;
  setReaderFontSize: (size: number) => void;
  setTranslationEngine: (engine: string) => void;
  setTargetLang: (lang: string) => void;
  setAiProvider: (provider: AiProvider) => void;
  setAiModel: (model: string) => void;
  setAiApiKey: (key: string) => void;
  setAiBaseUrl: (url: string) => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const STORAGE_KEY_THEME = 'ls_theme';
const STORAGE_KEY_CEFR = 'ls_target_cefr';
const STORAGE_KEY_CUSTOM_TOPICS = 'ls_custom_topics';
const STORAGE_KEY_FONT_FAMILY = 'ls_reader_font_family';
const STORAGE_KEY_FONT_SIZE = 'ls_reader_font_size';
const STORAGE_KEY_ENGINE = 'ls_translation_engine';
const STORAGE_KEY_TARGET_LANG = 'ls_target_lang';
const STORAGE_KEY_AI_PROVIDER = 'ls_ai_provider';
const STORAGE_KEY_AI_MODEL = 'ls_ai_model';
const STORAGE_KEY_AI_API_KEY = 'ls_ai_api_key';
const STORAGE_KEY_AI_BASE_URL = 'ls_ai_base_url';

const DEFAULT_CUSTOM_TOPICS: string[] = [
  'FinTech & Crypto',
  'Startup Culture',
  'Philosophy & Mindset',
  'History & Civilizations',
];

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  local: 'mistral',
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_THEME) as AppTheme | null;
    if (saved && ['cosmic', 'sepia', 'light', 'midnight', 'emerald'].includes(saved)) {
      return saved;
    }
    return 'cosmic';
  });

  const [targetCefr, setTargetCefrState] = useState<CefrLevel>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CEFR) as CefrLevel | null;
    if (saved && ['A2', 'B1', 'B2', 'C1'].includes(saved)) {
      return saved;
    }
    return 'B1';
  });

  const [customTopics, setCustomTopicsState] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_TOPICS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_CUSTOM_TOPICS;
  });

  const [readerFontFamily, setReaderFontFamilyState] = useState<EpubFontFamily>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FONT_FAMILY) as EpubFontFamily | null;
    if (saved && ['literata', 'sans', 'georgia', 'mono'].includes(saved)) {
      return saved;
    }
    return 'literata';
  });

  const [readerFontSize, setReaderFontSizeState] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FONT_SIZE);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= 70 && val <= 160) return val;
    }
    return 110;
  });

  const [translationEngine, setTranslationEngineState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ENGINE) || 'gemini';
  });

  const [targetLang, setTargetLangState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_TARGET_LANG) || 'ka';
  });

  const [aiProvider, setAiProviderState] = useState<AiProvider>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AI_PROVIDER) as AiProvider | null;
    if (saved && ['gemini', 'deepseek', 'openai', 'local'].includes(saved)) {
      return saved;
    }
    return 'gemini';
  });

  const [aiModel, setAiModelState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_AI_MODEL) || DEFAULT_MODELS['gemini'];
  });

  const [aiApiKey, setAiApiKeyState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_AI_API_KEY) || '';
  });

  const [aiBaseUrl, setAiBaseUrlState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_AI_BASE_URL) || '';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Sync theme with HTML document root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY_THEME, newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, []);

  const setTargetCefr = useCallback((level: CefrLevel) => {
    setTargetCefrState(level);
    localStorage.setItem(STORAGE_KEY_CEFR, level);
  }, []);

  const addCustomTopic = useCallback((topic: string): boolean => {
    const trimmed = topic.trim();
    if (!trimmed) return false;
    let added = false;
    setCustomTopicsState((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      added = true;
      const next = [trimmed, ...prev];
      localStorage.setItem(STORAGE_KEY_CUSTOM_TOPICS, JSON.stringify(next));
      return next;
    });
    return added;
  }, []);

  const removeCustomTopic = useCallback((topic: string) => {
    setCustomTopicsState((prev) => {
      const next = prev.filter((t) => t.toLowerCase() !== topic.toLowerCase());
      localStorage.setItem(STORAGE_KEY_CUSTOM_TOPICS, JSON.stringify(next));
      return next;
    });
  }, []);

  const setReaderFontFamily = useCallback((font: EpubFontFamily) => {
    setReaderFontFamilyState(font);
    localStorage.setItem(STORAGE_KEY_FONT_FAMILY, font);
  }, []);

  const setReaderFontSize = useCallback((size: number) => {
    const clamped = Math.min(160, Math.max(70, size));
    setReaderFontSizeState(clamped);
    localStorage.setItem(STORAGE_KEY_FONT_SIZE, clamped.toString());
  }, []);

  const setTranslationEngine = useCallback((engine: string) => {
    setTranslationEngineState(engine);
    localStorage.setItem(STORAGE_KEY_ENGINE, engine);
  }, []);

  const setTargetLang = useCallback((lang: string) => {
    setTargetLangState(lang);
    localStorage.setItem(STORAGE_KEY_TARGET_LANG, lang);
  }, []);

  const setAiProvider = useCallback((prov: AiProvider) => {
    setAiProviderState(prov);
    localStorage.setItem(STORAGE_KEY_AI_PROVIDER, prov);
    // Switch default model if current model isn't matching
    const defModel = DEFAULT_MODELS[prov];
    setAiModelState(defModel);
    localStorage.setItem(STORAGE_KEY_AI_MODEL, defModel);
  }, []);

  const setAiModel = useCallback((model: string) => {
    setAiModelState(model);
    localStorage.setItem(STORAGE_KEY_AI_MODEL, model);
  }, []);

  const setAiApiKey = useCallback((key: string) => {
    setAiApiKeyState(key);
    localStorage.setItem(STORAGE_KEY_AI_API_KEY, key);
  }, []);

  const setAiBaseUrl = useCallback((url: string) => {
    setAiBaseUrlState(url);
    localStorage.setItem(STORAGE_KEY_AI_BASE_URL, url);
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        targetCefr,
        customTopics,
        readerFontFamily,
        readerFontSize,
        translationEngine,
        targetLang,
        aiProvider,
        aiModel,
        aiApiKey,
        aiBaseUrl,
        setTheme,
        setTargetCefr,
        addCustomTopic,
        removeCustomTopic,
        setReaderFontFamily,
        setReaderFontSize,
        setTranslationEngine,
        setTargetLang,
        setAiProvider,
        setAiModel,
        setAiApiKey,
        setAiBaseUrl,
        isSettingsOpen,
        openSettings,
        closeSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
