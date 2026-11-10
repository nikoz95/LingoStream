import { useLanguage } from '../lib/i18n';

interface LanguageToggleProps {
  className?: string;
}

export default function LanguageToggle({ className = '' }: LanguageToggleProps) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={`inline-flex items-center p-1 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold ${className}`}
      role="group"
      aria-label="Interface Language"
    >
      <button
        type="button"
        onClick={() => setLang('ka')}
        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
          lang === 'ka'
            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm shadow-purple-500/30'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        }`}
        title="ქართული ინტერფეისი"
      >
        <span>🇬🇪</span>
        <span>ქარ</span>
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
          lang === 'en'
            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm shadow-purple-500/30'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        }`}
        title="English Interface"
      >
        <span>🇬🇧</span>
        <span>ENG</span>
      </button>
    </div>
  );
}
