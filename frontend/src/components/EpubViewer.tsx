import { useEffect, useRef, useState } from 'react';
import { EpubEngine } from '../lib/reader/EpubEngine';
import type { TextPick } from '../lib/textPicker';
import LoadingSpinner from './LoadingSpinner';

interface EpubViewerProps {
  bookBlob: Blob | null;
  fontSize: number;
  theme: 'night' | 'sepia';
  onTextPick: (pick: TextPick) => void;
  className?: string;
}

export default function EpubViewer({
  bookBlob,
  fontSize,
  theme,
  onTextPick,
  className = '',
}: EpubViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EpubEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !bookBlob) return;

    let isCancelled = false;
    setLoading(true);
    setError(null);

    const initEngine = async () => {
      try {
        const engine = new EpubEngine(containerRef.current!);
        engineRef.current = engine;

        engine.onTextPick((pick) => {
          onTextPick(pick);
        });

        await engine.open(bookBlob);
        if (!isCancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to open EPUB in Foliate:', err);
          setError(err instanceof Error ? err.message : 'Failed to load EPUB');
          setLoading(false);
        }
      }
    };

    initEngine();

    return () => {
      isCancelled = true;
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, [bookBlob, onTextPick]);

  // Adjust theme & font size inside Foliate view
  useEffect(() => {
    if (!containerRef.current) return;
    const foliateView = containerRef.current.querySelector('foliate-view') as any;
    if (foliateView && foliateView.renderer) {
      try {
        foliateView.renderer.setStyles?.(`
          body {
            font-size: ${fontSize}% !important;
            color: ${theme === 'sepia' ? '#433422' : '#E8E9ED'} !important;
            background-color: ${theme === 'sepia' ? '#F4ECD8' : '#1A1B1E'} !important;
            line-height: 1.7 !important;
          }
          ::selection {
            background: rgba(168, 85, 247, 0.4) !important;
          }
        `);
      } catch (e) {
        // ignore if not ready yet
      }
    }
  }, [fontSize, theme]);

  return (
    <div className={`relative w-full h-full flex flex-col ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/40 backdrop-blur-xs">
          <LoadingSpinner message="Formatting E-Reader..." light />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-red-400 text-sm bg-gray-900/80 px-4 py-3 rounded-xl border border-red-500/20">
            {error}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full flex-1 overflow-hidden"
        style={{
          backgroundColor: theme === 'sepia' ? '#F4ECD8' : '#1A1B1E',
        }}
      />
    </div>
  );
}
