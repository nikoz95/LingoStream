import { useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  targetLang: string;
  onTargetLangChange: (lang: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  provider,
  onProviderChange,
  targetLang,
  onTargetLangChange,
  fontSize,
  onFontSizeChange,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-white/15 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-base font-semibold text-white">Reader Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Translation Engine */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider block">
            AI Translation Engine
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'openai', label: 'Gemini Flash', desc: 'Fastest' },
              { id: 'deepseek', label: 'DeepSeek', desc: 'Literary' },
              { id: 'local', label: 'Local AI', desc: 'Offline' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onProviderChange(item.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  provider === item.id || (!provider && item.id === 'openai')
                    ? 'border-purple-500 bg-purple-500/20 text-white'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                }`}
              >
                <div className="text-xs font-medium">{item.label}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Target Language */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider block">
            Translate Into
          </label>
          <select
            value={targetLang}
            onChange={(e) => onTargetLangChange(e.target.value)}
            className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="ka" className="bg-gray-900 text-white">Georgian (ქართული)</option>
            <option value="en" className="bg-gray-900 text-white">English</option>
            <option value="de" className="bg-gray-900 text-white">German (Deutsch)</option>
            <option value="fr" className="bg-gray-900 text-white">French (Français)</option>
            <option value="es" className="bg-gray-900 text-white">Spanish (Español)</option>
            <option value="ru" className="bg-gray-900 text-white">Russian (Русский)</option>
          </select>
        </div>

        {/* E-Reader Font Size */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              Reading Font Size
            </label>
            <span className="text-xs text-purple-400 font-medium">{fontSize}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onFontSizeChange(Math.max(70, fontSize - 10))}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors"
            >
              A-
            </button>
            <input
              type="range"
              min="70"
              max="160"
              step="10"
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <button
              onClick={() => onFontSizeChange(Math.min(160, fontSize + 10))}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors"
            >
              A+
            </button>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-medium text-sm text-white transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
