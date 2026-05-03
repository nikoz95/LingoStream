interface TranslationPanelProps {
  selectedText: string;
  translationResult: { original: string; translation: string } | null;
  translationError: string;
  translating: boolean;
  isStreaming?: boolean;
  provider: string;
  onProviderChange: (provider: string) => void;
  onTranslate: () => void;
  onClose: () => void;
}

export default function TranslationPanel({
  selectedText,
  translationResult,
  translationError,
  translating,
  provider,
  onProviderChange,
  onTranslate,
  onClose,
}: TranslationPanelProps) {
  const providers = [
    { value: '', label: 'Default' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'deepseek', label: 'DeepSeek' },
  ];

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold opacity-70 uppercase tracking-wider">
          Translation
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors opacity-50 hover:opacity-100"
          title="Close panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* No selection state */}
      {!selectedText && !translationResult && (
        <div className="flex flex-col items-center justify-center h-48 text-center opacity-40">
          <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 5h12M3 12h18M3 19h6" />
          </svg>
          <p className="text-sm">Select any text in the PDF to translate it</p>
        </div>
      )}

      {/* Selected text - ready to translate */}
      {selectedText && !translationResult && !translating && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Selected Text
            </label>
            <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed">
              {selectedText}
            </div>
          </div>

          <button
            onClick={onTranslate}
            className="w-full py-2.5 rounded-xl bg-white/20 hover:bg-white/30 font-medium text-sm
              transition-all duration-200"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5h12M3 12h18M3 19h6" />
              </svg>
              Translate to Georgian
            </span>
          </button>
        </div>
      )}

      {/* Translating state */}
      {translating && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-current/30 border-t-current rounded-full animate-spin mb-3" />
          <p className="text-sm opacity-60">Translating...</p>
        </div>
      )}

      {/* Translation result */}
      {translationResult && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Original
            </label>
            <div className="p-3 rounded-xl bg-white/10 text-sm leading-relaxed">
              {translationResult.original}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
              Translation
            </label>
            <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/20 text-sm leading-relaxed">
              {translationResult.translation}
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-xs opacity-40 hover:opacity-70 transition-opacity"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Provider selector */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <label className="text-xs font-medium opacity-50 uppercase tracking-wider mb-2 block">
          Translation Engine
        </label>
        <div className="flex gap-2">
          {providers.map((p) => (
            <button
              key={p.value}
              onClick={() => onProviderChange(p.value)}
              className={`flex-1 py-1.5 text-xs rounded-xl font-medium transition-all duration-200 ${
                provider === p.value
                  ? 'bg-white/20 border border-white/20'
                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {translationError && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {translationError}
        </div>
      )}
    </div>
  );
}
