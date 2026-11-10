import { useState, useCallback, useMemo } from 'react';
import { useSettings, type AppTheme, type AiProvider } from '../lib/settings';
import { useLanguage, type Translations } from '../lib/i18n';
import { testAiConnection, type CefrLevel } from '../lib/api';
import type { EpubFontFamily } from '../lib/reader/EpubEngine';

interface SettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  provider?: string;
  onProviderChange?: (provider: string) => void;
  targetLang?: string;
  onTargetLangChange?: (lang: string) => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
}

type TabType = 'themes' | 'topics' | 'ai';

interface ThemeCardOption {
  id: AppTheme;
  title: (t: Translations) => string;
  desc: (t: Translations) => string;
  bgHex: string;
  cardHex: string;
  accentHex: string;
  textColor: string;
  icon: string;
}

const THEME_OPTIONS: ThemeCardOption[] = [
  {
    id: 'cosmic',
    title: (t) => t.themeCosmic,
    desc: (t) => t.themeCosmicDesc,
    bgHex: '#0f172a',
    cardHex: '#3b0764',
    accentHex: '#a855f7',
    textColor: '#e8e9ed',
    icon: '🌌',
  },
  {
    id: 'sepia',
    title: (t) => t.themeSepia,
    desc: (t) => t.themeSepiaDesc,
    bgHex: '#f4ecd8',
    cardHex: '#eadfc7',
    accentHex: '#b45309',
    textColor: '#382e21',
    icon: '📜',
  },
  {
    id: 'midnight',
    title: (t) => t.themeMidnight,
    desc: (t) => t.themeMidnightDesc,
    bgHex: '#020617',
    cardHex: '#0f2b48',
    accentHex: '#38bdf8',
    textColor: '#f1f5f9',
    icon: '🌊',
  },
  {
    id: 'emerald',
    title: (t) => t.themeEmerald,
    desc: (t) => t.themeEmeraldDesc,
    bgHex: '#022016',
    cardHex: '#064e3b',
    accentHex: '#10b981',
    textColor: '#ecfdf5',
    icon: '🌲',
  },
  {
    id: 'light',
    title: (t) => t.themeLight,
    desc: (t) => t.themeLightDesc,
    bgHex: '#f8fafc',
    cardHex: '#ede9fe',
    accentHex: '#7c3aed',
    textColor: '#0f172a',
    icon: '☀️',
  },
];

const CEFR_OPTIONS: { level: CefrLevel; label: string; descKey: keyof Translations }[] = [
  { level: 'A2', label: 'A2', descKey: 'cefrA2Desc' },
  { level: 'B1', label: 'B1', descKey: 'cefrB1Desc' },
  { level: 'B2', label: 'B2', descKey: 'cefrB2Desc' },
  { level: 'C1', label: 'C1', descKey: 'cefrC1Desc' },
];

const FONT_OPTIONS: { id: EpubFontFamily; label: string; preview: string }[] = [
  { id: 'literata', label: 'Literata (Serif)', preview: 'Literata, Georgia, serif' },
  { id: 'sans', label: 'Inter (Sans)', preview: 'Inter, system-ui, sans-serif' },
  { id: 'georgia', label: 'Georgia (Classic)', preview: 'Georgia, serif' },
  { id: 'mono', label: 'Monospace (Code)', preview: 'JetBrains Mono, monospace' },
];

interface ProviderPreset {
  id: AiProvider;
  name: string;
  badge: string;
  icon: string;
  keyUrl: string;
  models: { id: string; name: string; tag: string }[];
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Fast & High Context',
    icon: '🔷',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'სწრაფი & რეკომენდებული' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tag: 'მაღალი ლიტერატურული დონე' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tag: 'სტაბილური fallback' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    badge: 'Nuanced & Literary',
    icon: '🐋',
    keyUrl: 'https://platform.deepseek.com/',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', tag: 'ძლიერი ლიტერატურული ენა' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', tag: 'ღრმა გრამატიკული ანალიზი' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    badge: 'Standard Quality',
    icon: '🟢',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tag: 'სწრაფი და ეკონომიური' },
      { id: 'gpt-4o', name: 'GPT-4o', tag: 'ფლაგმანი მოდელი' },
    ],
  },
  {
    id: 'local',
    name: 'Local / Ollama',
    badge: 'Offline & Private',
    icon: '💻',
    keyUrl: 'https://ollama.com/',
    models: [
      { id: 'mistral', name: 'Mistral 7B', tag: 'სწრაფი ლოკალური' },
      { id: 'llama3', name: 'Llama 3 8B', tag: 'ძლიერი ლოკალური' },
    ],
  },
];

export default function SettingsModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  provider: propProvider,
  onProviderChange: propOnProviderChange,
  targetLang: propTargetLang,
  onTargetLangChange: propOnTargetLangChange,
  fontSize: propFontSize,
  onFontSizeChange: propOnFontSizeChange,
}: SettingsModalProps) {
  const settings = useSettings();
  const { t, lang, setLang } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('themes');
  const [newTopicInput, setNewTopicInput] = useState('');
  const [topicError, setTopicError] = useState('');

  // Password visibility toggle for API Key
  const [showApiKey, setShowApiKey] = useState(false);

  // Connection test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Controlled or un-controlled open state
  const isOpen = propIsOpen !== undefined ? propIsOpen : settings.isSettingsOpen;
  const handleClose = propOnClose || settings.closeSettings;

  // Controlled or context-driven provider
  const currentProvider = propProvider !== undefined ? propProvider : settings.translationEngine;
  const handleProviderChange = (newEngine: string) => {
    if (propOnProviderChange) propOnProviderChange(newEngine);
    settings.setTranslationEngine(newEngine);
  };

  // Controlled or context-driven targetLang
  const currentTargetLang = propTargetLang !== undefined ? propTargetLang : settings.targetLang;
  const handleTargetLangChange = (newLang: string) => {
    if (propOnTargetLangChange) propOnTargetLangChange(newLang);
    settings.setTargetLang(newLang);
  };

  // Controlled or context-driven font size
  const currentFontSize = propFontSize !== undefined ? propFontSize : settings.readerFontSize;
  const handleFontSizeChange = (newSize: number) => {
    if (propOnFontSizeChange) propOnFontSizeChange(newSize);
    settings.setReaderFontSize(newSize);
  };

  const handleAddTopic = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTopicInput.trim()) return;
      const success = settings.addCustomTopic(newTopicInput.trim());
      if (success) {
        setNewTopicInput('');
        setTopicError('');
      } else {
        setTopicError(t.customTopicAlreadyExists);
      }
    },
    [newTopicInput, settings, t.customTopicAlreadyExists],
  );

  const selectedPreset = useMemo(() => {
    return PROVIDER_PRESETS.find((p) => p.id === settings.aiProvider) || PROVIDER_PRESETS[0];
  }, [settings.aiProvider]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection({
        provider: settings.aiProvider,
        model: settings.aiModel,
        api_key: settings.aiApiKey,
        base_url: settings.aiBaseUrl,
      });
      setTestResult({
        success: res.success,
        message: res.message,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'ტესტირება ვერ მოხერხდა',
      });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-4 animate-fadeIn">
      <div className="bg-gray-900/95 border border-white/15 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚙️</span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                {t.settingsTitle}
              </h3>
              <p className="text-xs text-white/50">{t.navSettings}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
            title={t.close}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-2 border-b border-white/10 shrink-0">
          <div className="grid grid-cols-3 p-1 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setActiveTab('themes')}
              className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer truncate ${
                activeTab === 'themes'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {t.settingsTabThemes}
            </button>
            <button
              onClick={() => setActiveTab('topics')}
              className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer truncate ${
                activeTab === 'topics'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {t.settingsTabTopics}
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer truncate ${
                activeTab === 'ai'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {t.settingsTabAi}
            </button>
          </div>
        </div>

        {/* Scrollable Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: THEMES & VISUALS */}
          {activeTab === 'themes' && (
            <div className="space-y-6">
              {/* Theme Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-3">
                  {t.settingsTabThemes}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {THEME_OPTIONS.map((th) => {
                    const isSelected = settings.theme === th.id;
                    return (
                      <button
                        key={th.id}
                        onClick={() => settings.setTheme(th.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          isSelected
                            ? 'border-purple-400 bg-purple-500/20 ring-2 ring-purple-500/40 shadow-lg'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{th.icon}</span>
                            <span className="text-sm font-bold text-white">{th.title(t)}</span>
                          </div>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500 text-white">
                              ✓ აქტიური
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/60 mb-3">{th.desc(t)}</p>

                        {/* Swatch preview bar */}
                        <div className="h-4 w-full rounded-lg flex overflow-hidden border border-white/20">
                          <div className="w-1/2" style={{ backgroundColor: th.bgHex }} />
                          <div className="w-1/3" style={{ backgroundColor: th.cardHex }} />
                          <div className="w-1/6" style={{ backgroundColor: th.accentHex }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reader Font Family */}
              <div className="pt-2 border-t border-white/10">
                <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-2">
                  {t.readerFontFamilyLabel}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FONT_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => settings.setReaderFontFamily(f.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        settings.readerFontFamily === f.id
                          ? 'border-purple-400 bg-purple-500/20 text-white font-bold'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                      }`}
                      style={{ fontFamily: f.preview }}
                    >
                      <div className="text-sm">Abc</div>
                      <div className="text-[11px] truncate opacity-70 mt-1">{f.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reader Font Size */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    {t.readerFontSizeLabel}
                  </label>
                  <span className="text-xs font-semibold text-purple-400">{currentFontSize}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleFontSizeChange(Math.max(70, currentFontSize - 10))}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors cursor-pointer"
                  >
                    A-
                  </button>
                  <input
                    type="range"
                    min="70"
                    max="160"
                    step="10"
                    value={currentFontSize}
                    onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                    className="flex-1 accent-purple-500 cursor-pointer"
                  />
                  <button
                    onClick={() => handleFontSizeChange(Math.min(160, currentFontSize + 10))}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors cursor-pointer"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LEARNING TOPICS & CEFR */}
          {activeTab === 'topics' && (
            <div className="space-y-6">
              {/* Target CEFR Level */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-2">
                  {t.targetLevelLabel}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CEFR_OPTIONS.map((item) => {
                    const isSelected = settings.targetCefr === item.level;
                    return (
                      <button
                        key={item.level}
                        onClick={() => settings.setTargetCefr(item.level)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-purple-400 bg-purple-500/25 ring-2 ring-purple-500/30 text-white font-bold'
                            : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                        }`}
                      >
                        <div className="text-base font-bold">{item.label}</div>
                        <div className="text-[10px] text-white/60 line-clamp-2 mt-1">
                          {t[item.descKey]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Topics Manager */}
              <div className="pt-2 border-t border-white/10 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-white">{t.customTopicsTitle}</h4>
                  <p className="text-xs text-white/50 leading-relaxed mt-0.5">
                    {t.customTopicsDesc}
                  </p>
                </div>

                {/* Add Topic Input */}
                <form onSubmit={handleAddTopic} className="flex gap-2">
                  <input
                    type="text"
                    value={newTopicInput}
                    onChange={(e) => {
                      setNewTopicInput(e.target.value);
                      if (topicError) setTopicError('');
                    }}
                    placeholder={t.customTopicInputPlaceholder}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-purple-400 placeholder:text-white/30"
                  />
                  <button
                    type="submit"
                    disabled={!newTopicInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-bold text-white transition-all cursor-pointer shrink-0"
                  >
                    {t.customTopicAddBtn}
                  </button>
                </form>
                {topicError && <p className="text-xs text-red-400">{topicError}</p>}

                {/* Active Topics Chips */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-white/60 block">
                    დამატებული თემები ({settings.customTopics.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {settings.customTopics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-200 text-xs font-medium"
                      >
                        <span>🏷️ {topic}</span>
                        <button
                          type="button"
                          onClick={() => settings.removeCustomTopic(topic)}
                          className="hover:text-red-400 text-white/40 ml-1 transition-colors cursor-pointer text-xs"
                          title="წაშლა"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AI & LANGUAGE (BYOK) */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Interface & Translation Target Language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-2">
                    {t.uiLanguageLabel}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLang('ka')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        lang === 'ka'
                          ? 'border-purple-400 bg-purple-500/25 text-white font-bold'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                      }`}
                    >
                      <span className="text-base">🇬🇪</span>
                      <span className="text-xs">ქართული</span>
                    </button>
                    <button
                      onClick={() => setLang('en')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        lang === 'en'
                          ? 'border-purple-400 bg-purple-500/25 text-white font-bold'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                      }`}
                    >
                      <span className="text-base">🇬🇧</span>
                      <span className="text-xs">English</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-2">
                    {t.translateIntoLabel}
                  </label>
                  <select
                    value={currentTargetLang}
                    onChange={(e) => handleTargetLangChange(e.target.value)}
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-400 cursor-pointer"
                  >
                    <option value="ka" className="bg-gray-900 text-white">Georgian (ქართული)</option>
                    <option value="en" className="bg-gray-900 text-white">English</option>
                    <option value="de" className="bg-gray-900 text-white">German (Deutsch)</option>
                    <option value="fr" className="bg-gray-900 text-white">French (Français)</option>
                    <option value="es" className="bg-gray-900 text-white">Spanish (Español)</option>
                    <option value="ru" className="bg-gray-900 text-white">Russian (Русский)</option>
                  </select>
                </div>
              </div>

              {/* AI Provider Cards */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    {t.aiProviderLabel}
                  </label>
                  <a
                    href={selectedPreset.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                  >
                    {t.aiGetKeyLink}
                  </a>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROVIDER_PRESETS.map((p) => {
                    const isSelected = settings.aiProvider === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          settings.setAiProvider(p.id);
                          handleProviderChange(p.id);
                          setTestResult(null);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-purple-400 bg-purple-500/25 ring-2 ring-purple-500/30 text-white shadow-md'
                            : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-base">{p.icon}</span>
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                        </div>
                        <div className="text-[10px] text-white/50 truncate">{p.badge}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Model Selection Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block">
                  {t.aiModelLabel} ({selectedPreset.name})
                </label>
                <div className="flex gap-2">
                  <select
                    value={settings.aiModel}
                    onChange={(e) => {
                      settings.setAiModel(e.target.value);
                      setTestResult(null);
                    }}
                    className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-400 cursor-pointer"
                  >
                    {selectedPreset.models.map((m) => (
                      <option key={m.id} value={m.id} className="bg-gray-900 text-white">
                        {m.name} — {m.tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Personal API Key (BYOK) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    {t.aiApiKeyLabel}
                  </label>
                  <span className="text-[10px] text-white/40">
                    {settings.aiApiKey ? '● პირადი გასაღები გაწერილია' : '○ სისტემური ნაგულისხმევი'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.aiApiKey}
                    onChange={(e) => {
                      settings.setAiApiKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={t.aiApiKeyPlaceholder}
                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-3.5 pr-20 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-400 placeholder:text-white/30 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {settings.aiApiKey && (
                      <button
                        type="button"
                        onClick={() => {
                          settings.setAiApiKey('');
                          setTestResult(null);
                        }}
                        className="p-1 text-xs text-white/40 hover:text-white transition-colors cursor-pointer"
                        title="გასუფთავება"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="px-2 py-1 text-xs text-white/50 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                      title={showApiKey ? 'დამალვა' : 'ჩვენება'}
                    >
                      {showApiKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-white/50">{t.aiApiKeyHint}</p>
              </div>

              {/* For Local: Base URL input */}
              {settings.aiProvider === 'local' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block">
                    {t.aiBaseUrlLabel}
                  </label>
                  <input
                    type="text"
                    value={settings.aiBaseUrl}
                    onChange={(e) => settings.setAiBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-400 placeholder:text-white/30 font-mono"
                  />
                </div>
              )}

              {/* Connection Test Action */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-4 py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-xs font-bold text-white transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{t.aiTesting}</span>
                      </>
                    ) : (
                      <span>{t.aiTestBtn}</span>
                    )}
                  </button>

                  {testResult && (
                    <div
                      className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 flex-1 truncate ${
                        testResult.success
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-500/20 border-red-500/40 text-red-300'
                      }`}
                    >
                      <span>{testResult.success ? '✅' : '❌'}</span>
                      <span className="truncate">{testResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end shrink-0 bg-white/[0.02]">
          <button
            onClick={handleClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-semibold text-sm text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer"
          >
            {t.save} / {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
