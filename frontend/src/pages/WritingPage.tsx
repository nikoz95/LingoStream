import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  evaluateWriting,
  sendWritingChat,
  explainWritingDeepDive,
  translateWritingWord,
  saveVocabularyWord,
  logout,
  type EvaluateWritingResponse,
  type CorrectionItem,
  type SuggestedWordItem,
  type WritingChatMessage,
  type ChatUserFeedback,
  type DeepDiveExplainResponse,
} from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

type StudioMode = 'free' | 'chat';
type RewriteTab = 'corrected' | 'spoken' | 'elevated';

interface DeepDiveThreadState {
  loading: boolean;
  error: string;
  history: WritingChatMessage[];
  latestResponse: DeepDiveExplainResponse | null;
  customQuestion: string;
}

interface ChatTurnItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  translation?: string;
  showTranslation?: boolean;
  feedback?: ChatUserFeedback | null;
}

const SPARK_PROMPTS = [
  'What would you do if you woke up 100 years in the future? (რას იზამდი 100 წლის შემდეგ რომ გაგღვიძებოდა?)',
  'Tell a story about a trip or outing that went completely differently than planned.',
  'What is an unpopular opinion you strongly believe in, and why?',
  'If you could master any skill overnight without effort, what would you choose and how would you use it?',
  'Describe a movie, book, or series that changed the way you look at something.',
  'Imagine you are opening a small café or studio in your favorite city — what is the vibe like?',
  'What is the funniest misunderstanding you have ever experienced or witnessed?',
];

const ROLEPLAY_SCENARIOS = [
  {
    id: 'free',
    icon: '💬',
    title: 'თავისუფალი საუბარი (Free Talk)',
    desc: 'მეგობრული საუბარი ნებისმიერ თემაზე — ფილმები, იდეები, ყოველდღიურობა',
    prompt: 'Casual, friendly conversation with a curious friend about daily life, hobbies, movies, or ideas.',
  },
  {
    id: 'detective',
    icon: '🕵️',
    title: 'დეტექტიური გამოძიება (Mystery)',
    desc: 'მუზეუმიდან ნახატი გაქრა — შენ ხარ დეტექტივი ან ეჭვმიტანილი',
    prompt: 'A famous painting was stolen from the Grand Museum last night. Play a witty witness/suspect being questioned by the user, or challenge their alibi in a fun mystery roleplay.',
  },
  {
    id: 'debate',
    icon: '🎭',
    title: 'დებატები (Debate Me)',
    desc: 'AI იცავს საპირისპირო პოზიციას და შენ შენი არგუმენტებით ეკამათები',
    prompt: 'Playful intellectual debate partner. Pick an interesting everyday controversy (e.g. remote work vs office, AI creativity, city vs nature) and challenge the user with sharp but friendly counterarguments.',
  },
  {
    id: 'travel',
    icon: '☕',
    title: 'მოგზაურობა და სიტუაციები (Real Life)',
    desc: 'უცხო ქალაქში სასტუმროს, კაფეს ან დაკარგული ბარგის მოგვარება',
    prompt: 'Roleplay a lively real-world travel situation: the user just arrived in London, their hotel reservation got mixed up or they are ordering at a busy local spot. Be helpful, realistic, and conversational.',
  },
  {
    id: 'interview',
    icon: '🚀',
    title: 'იდეის პრეზენტაცია / ინტერვიუ',
    desc: 'წარადგინე შენი პროექტი ან გაიარე საინტერესო გასაუბრება',
    prompt: 'You are an enthusiastic podcast host or startup investor interviewing the user about their work, passions, or a cool project they are building.',
  },
];

const QUICK_DEEP_DIVE_QUESTIONS = [
  'გრამატიკული წესი დეტალურად ამიხსენი',
  'ჩემი ვერსია რატომ არის შეცდომა და როდის იქნებოდა სწორი?',
  'რა ნიუანსური სხვაობაა ჩემსა და შესწორებულ ვარიანტს შორის?',
  'მომეცი კიდევ 3 ბუნებრივი სასაუბრო მაგალითი',
];

export default function WritingPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<StudioMode>('free');

  // ── Free Writing State ──
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState('');
  const [evalResult, setEvalResult] = useState<EvaluateWritingResponse | null>(null);
  const [activeRewriteTab, setActiveRewriteTab] = useState<RewriteTab>('spoken');

  // ── Deep Dive ("რატომ? / ჩაეძიე") State keyed by unique ID ──
  const [openDeepDiveIds, setOpenDeepDiveIds] = useState<Record<string, boolean>>({});
  const [deepDiveThreads, setDeepDiveThreads] = useState<Record<string, DeepDiveThreadState>>({});

  // ── Custom phrase Deep-Dive modal/box in Free Writing ──
  const [customExplainPhrase, setCustomExplainPhrase] = useState('');

  // ── Word Lookup Popover (clicking any word in AI rewrites/replies) ──
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<SuggestedWordItem | null>(null);
  const [lookupError, setLookupError] = useState('');

  // ── Saved to Vocabulary tracking ──
  const [savedWordsMap, setSavedWordsMap] = useState<Record<string, boolean>>({});
  const [savingWordMap, setSavingWordMap] = useState<Record<string, boolean>>({});

  // ── Interactive Chat / Roleplay State ──
  const [selectedScenarioId, setSelectedScenarioId] = useState('free');
  const [customScenario, setCustomScenario] = useState('');
  const [chatTurns, setChatTurns] = useState<ChatTurnItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  // ── Speech-to-Text (Microphone) State ──
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // ── Audio TTS Helper ──
  const speakText = useCallback((content: string) => {
    if ('speechSynthesis' in window && content) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // ── Speech-to-Text Toggle ──
  const toggleVoiceInput = useCallback(
    (target: 'free' | 'chat') => {
      const SpeechRecognitionAPI =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognitionAPI) {
        alert('თქვენს ბრაუზერს არ აქვს ხმოვანი კარნახის (Speech Recognition) მხარდაჭერა. სცადეთ Chrome ან Edge.');
        return;
      }

      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
        return;
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (!transcript) return;
        if (target === 'free') {
          setText((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
        } else {
          setChatInput((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [isListening],
  );

  // ── Save Word to Vocabulary ──
  const handleSaveToVocabulary = useCallback(async (item: SuggestedWordItem) => {
    const key = item.word.toLowerCase().trim();
    if (!key || savedWordsMap[key] || savingWordMap[key]) return;

    setSavingWordMap((prev) => ({ ...prev, [key]: true }));
    try {
      await saveVocabularyWord({
        word: item.word,
        phonetic: item.phonetic || null,
        translation: item.translation || null,
        definition: item.definition || null,
        sentence_context: item.sentence_context || null,
        sentence_context_translated: item.sentence_context_translated || null,
        book_id: null,
      });
      setSavedWordsMap((prev) => ({ ...prev, [key]: true }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ვერ მოხერხდა სიტყვის შენახვა');
    } finally {
      setSavingWordMap((prev) => ({ ...prev, [key]: false }));
    }
  }, [savedWordsMap, savingWordMap]);

  // ── Click any word in AI output to look up & save ──
  const handleWordClick = useCallback(async (rawWord: string, contextSentence: string) => {
    const cleaned = rawWord.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '').trim();
    if (!cleaned || cleaned.length < 2) return;

    setLookupLoading(true);
    setLookupError('');
    setLookupResult(null);

    try {
      const res = await translateWritingWord(cleaned, contextSentence);
      setLookupResult({
        word: res.word,
        phonetic: res.phonetic,
        translation: res.translation,
        definition: res.definition,
        sentence_context: res.sentence_context || contextSentence,
        sentence_context_translated: res.sentence_context_translated,
      });
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'სიტყვის თარგმნა ვერ მოხერხდა');
    } finally {
      setLookupLoading(false);
    }
  }, []);

  // ── Spark Random Prompt ──
  const handleSparkPrompt = useCallback(() => {
    const next = SPARK_PROMPTS[Math.floor(Math.random() * SPARK_PROMPTS.length)];
    setTopic(next);
  }, []);

  // ── Evaluate Free Writing ──
  const handleEvaluateWriting = useCallback(async () => {
    if (!text.trim()) return;
    setEvaluating(true);
    setEvalError('');
    setOpenDeepDiveIds({});
    setDeepDiveThreads({});

    try {
      const res = await evaluateWriting({
        text: text.trim(),
        topic: topic.trim(),
        target_language: 'en',
        native_language: 'ka',
      });
      setEvalResult(res);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'ანალიზი ვერ მოხერხდა');
    } finally {
      setEvaluating(false);
    }
  }, [text, topic]);

  // ── Deep Dive ("რატომ? / ჩაეძიე") Trigger & Follow-up ──
  const askDeepDive = useCallback(
    async (
      threadId: string,
      originalText: string,
      correctedText: string,
      contextSentence: string,
      questionText?: string,
    ) => {
      setOpenDeepDiveIds((prev) => ({ ...prev, [threadId]: true }));

      const existing = deepDiveThreads[threadId] || {
        loading: false,
        error: '',
        history: [],
        latestResponse: null,
        customQuestion: '',
      };

      const q =
        questionText?.trim() ||
        existing.customQuestion.trim() ||
        'დეტალურად ამიხსენი რატომ არის ასე, რა გრამატიკული წესი მოქმედებს და რა სხვაობაა ჩემსა და შესწორებულ ვარიანტს შორის.';

      setDeepDiveThreads((prev) => ({
        ...prev,
        [threadId]: {
          ...existing,
          loading: true,
          error: '',
          customQuestion: '',
        },
      }));

      try {
        const res = await explainWritingDeepDive({
          original_text: originalText,
          corrected_text: correctedText,
          context_sentence: contextSentence,
          question: q,
          history: existing.history,
          target_language: 'en',
          native_language: 'ka',
        });

        const updatedHistory: WritingChatMessage[] = [
          ...existing.history,
          { role: 'user', content: q },
          { role: 'assistant', content: res.answer },
        ];

        setDeepDiveThreads((prev) => ({
          ...prev,
          [threadId]: {
            loading: false,
            error: '',
            history: updatedHistory,
            latestResponse: res,
            customQuestion: '',
          },
        }));
      } catch (err) {
        setDeepDiveThreads((prev) => ({
          ...prev,
          [threadId]: {
            ...existing,
            loading: false,
            error: err instanceof Error ? err.message : 'ახსნის მიღება ვერ მოხერხდა',
          },
        }));
      }
    },
    [deepDiveThreads],
  );

  // ── Start or Reset Interactive Chat ──
  const startNewChat = useCallback(
    async (scenarioOverride?: string) => {
      const scenarioObj = ROLEPLAY_SCENARIOS.find((s) => s.id === selectedScenarioId);
      const effectiveScenario =
        scenarioOverride ||
        (customScenario.trim() ? customScenario.trim() : scenarioObj?.prompt || 'Friendly conversation');

      setChatLoading(true);
      setChatError('');
      setChatTurns([]);

      try {
        const res = await sendWritingChat({
          messages: [],
          scenario: effectiveScenario,
          target_language: 'en',
          native_language: 'ka',
        });

        setChatTurns([
          {
            id: `turn-${Date.now()}`,
            role: 'assistant',
            content: res.reply,
            translation: res.reply_translation,
            showTranslation: false,
          },
        ]);
      } catch (err) {
        setChatError(err instanceof Error ? err.message : 'დიალოგის დაწყება ვერ მოხერხდა');
      } finally {
        setChatLoading(false);
      }
    },
    [selectedScenarioId, customScenario],
  );

  // ── Send User Message in Chat ──
  const handleSendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatError('');

    const userTurnId = `user-${Date.now()}`;
    const nextTurns: ChatTurnItem[] = [
      ...chatTurns,
      { id: userTurnId, role: 'user', content: userMsg },
    ];
    setChatTurns(nextTurns);
    setChatLoading(true);

    const scenarioObj = ROLEPLAY_SCENARIOS.find((s) => s.id === selectedScenarioId);
    const effectiveScenario = customScenario.trim()
      ? customScenario.trim()
      : scenarioObj?.prompt || 'Friendly conversation';

    try {
      const apiMessages: WritingChatMessage[] = nextTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const res = await sendWritingChat({
        messages: apiMessages,
        scenario: effectiveScenario,
        target_language: 'en',
        native_language: 'ka',
      });

      setChatTurns((prev) => {
        const updated = prev.map((t) =>
          t.id === userTurnId ? { ...t, feedback: res.user_feedback } : t,
        );
        return [
          ...updated,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: res.reply,
            translation: res.reply_translation,
            showTranslation: false,
          },
        ];
      });
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'პასუხის მიღება ვერ მოხერხდა');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatTurns, selectedScenarioId, customScenario]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    navigate('/login');
  }, [navigate]);

  // ── Helper to render clickable words in AI output ──
  const renderInteractiveText = (sentence: string) => {
    const tokens = sentence.split(/(\s+)/);
    return tokens.map((token, idx) => {
      if (/^\s+$/.test(token)) return <span key={idx}>{token}</span>;
      return (
        <span
          key={idx}
          onClick={() => handleWordClick(token, sentence)}
          className="cursor-pointer rounded px-0.5 hover:bg-purple-500/30 hover:text-purple-200 transition-colors"
          title="დააჭირე სიტყვის სათარგმნად და Vocabulary-ში შესანახად"
        >
          {token}
        </span>
      );
    });
  };

  // ── Helper to render a Deep-Dive ("რატომ? / ჩაეძიე") expandable thread ──
  const renderDeepDiveThread = (
    threadId: string,
    originalText: string,
    correctedText: string,
    contextSentence: string,
  ) => {
    const isOpen = !!openDeepDiveIds[threadId];
    const thread = deepDiveThreads[threadId];

    if (!isOpen) return null;

    return (
      <div className="mt-3 rounded-xl bg-indigo-950/50 border border-indigo-400/30 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
            <span>🎓</span>
            <span>ჩაძიება / გრამატიკული გარჩევა</span>
            {thread?.latestResponse?.grammar_rule_title && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200">
                {thread.latestResponse.grammar_rule_title}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpenDeepDiveIds((prev) => ({ ...prev, [threadId]: false }))}
            className="text-xs text-white/40 hover:text-white/80 cursor-pointer"
          >
            დახურვა ✕
          </button>
        </div>

        {/* Quick Question Chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_DEEP_DIVE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() =>
                askDeepDive(threadId, originalText, correctedText, contextSentence, q)
              }
              disabled={thread?.loading}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-400/40 text-white/80 transition-all cursor-pointer disabled:opacity-50"
            >
              💡 {q}
            </button>
          ))}
        </div>

        {thread?.loading && (
          <div className="py-3">
            <LoadingSpinner message="AI გრამატიკულ მიზეზებს და მაგალითებს ამზადებს..." />
          </div>
        )}

        {thread?.error && (
          <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg">{thread.error}</p>
        )}

        {/* Conversation history inside this deep-dive */}
        {thread && thread.history.length > 0 && (
          <div className="space-y-3">
            {thread.history.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100 ml-6'
                    : 'bg-black/30 border border-white/10 text-white/90'
                }`}
              >
                {msg.role === 'user' ? `❓ ${msg.content}` : msg.content}
              </div>
            ))}
          </div>
        )}

        {/* Examples from latest response */}
        {thread?.latestResponse?.examples && thread.latestResponse.examples.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-indigo-300">📌 დამატებითი მაგალითები:</p>
            <div className="grid grid-cols-1 gap-2">
              {thread.latestResponse.examples.map((ex, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5 text-xs space-y-1"
                >
                  {ex.wrong_variant && (
                    <div className="text-red-300/80 line-through">❌ {ex.wrong_variant}</div>
                  )}
                  <div className="text-emerald-300 font-medium flex items-center justify-between gap-2">
                    <span>✅ {renderInteractiveText(ex.correct)}</span>
                    <button
                      onClick={() => speakText(ex.correct)}
                      className="text-white/50 hover:text-white px-1.5 py-0.5 rounded bg-white/5 cursor-pointer"
                      title="მოსმენა"
                    >
                      🔊
                    </button>
                  </div>
                  {ex.translation && <div className="text-white/60">{ex.translation}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested words from deep-dive */}
        {thread?.latestResponse?.suggested_words &&
          thread.latestResponse.suggested_words.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {thread.latestResponse.suggested_words.map((sw, idx) => {
                const isSaved = !!savedWordsMap[sw.word.toLowerCase().trim()];
                return (
                  <button
                    key={idx}
                    onClick={() => handleSaveToVocabulary(sw)}
                    disabled={isSaved}
                    className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                      isSaved
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-400/30 text-purple-200'
                    }`}
                  >
                    <span>{isSaved ? '✓ შენახულია:' : '+ Vocabulary:'}</span>
                    <span className="font-semibold">{sw.word}</span>
                    {sw.translation && <span className="opacity-70">({sw.translation})</span>}
                  </button>
                );
              })}
            </div>
          )}

        {/* Follow-up custom question input */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={thread?.customQuestion || ''}
            onChange={(e) =>
              setDeepDiveThreads((prev) => ({
                ...prev,
                [threadId]: {
                  ...(prev[threadId] || {
                    loading: false,
                    error: '',
                    history: [],
                    latestResponse: null,
                  }),
                  customQuestion: e.target.value,
                },
              }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !thread?.loading) {
                askDeepDive(threadId, originalText, correctedText, contextSentence);
              }
            }}
            placeholder="ჩაეკითხე შენი სიტყვებით (მაგ: აქ Present Perfect რატომ არ წავა?)..."
            className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => askDeepDive(threadId, originalText, correctedText, contextSentence)}
            disabled={thread?.loading || !(thread?.customQuestion || '').trim()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            კითხვა
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/60 to-gray-950 text-white">
      {/* Header */}
      <header className="glass sticky top-0 z-40 px-4 lg:px-8 h-16 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/library')}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            title="ბიბლიოთეკაში დაბრუნება"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg lg:text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
              ✍️ Writing & Speaking Studio
            </h1>
            <p className="text-[11px] text-white/50 hidden sm:block">
              თავისუფალი წერა, ცოცხალი დიალოგი, გრამატიკაში ჩაძიება და Vocabulary-ს შევსება
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/library')}
            className="px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-all cursor-pointer"
          >
            📚 Library
          </button>
          <button
            onClick={() => navigate('/vocabulary')}
            className="px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>🗂️</span>
            <span>Vocabulary</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Mode Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex p-1 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setMode('free')}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                mode === 'free'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <span>📝</span>
              <span>Free Writing Studio</span>
            </button>
            <button
              onClick={() => {
                setMode('chat');
                if (chatTurns.length === 0 && !chatLoading) {
                  startNewChat();
                }
              }}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                mode === 'chat'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <span>💬</span>
              <span>AI Roleplay & Live Chat</span>
            </button>
          </div>

          <div className="text-xs text-white/50 bg-white/[0.03] border border-white/10 px-3.5 py-2 rounded-xl">
            💡 <span className="text-purple-300 font-medium">რჩევა:</span> თუ წერისას სიტყვა არ გახსენდება, პირდაპირ{' '}
            <span className="text-emerald-300 font-medium">ქართულად ჩაწერე</span> წინადადებაში — AI თარგმნის და აგიხსნის!
          </div>
        </div>

        {/* Word Lookup Floating Popover (when clicking any word in AI texts) */}
        {(lookupLoading || lookupResult || lookupError) && (
          <div className="rounded-2xl bg-indigo-950/90 border border-indigo-400/40 p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
            {lookupLoading && <LoadingSpinner message="სიტყვა ითარგმნება..." />}
            {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}
            {lookupResult && (
              <div className="flex-1 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base font-bold text-white">{lookupResult.word}</span>
                    {lookupResult.phonetic && (
                      <span className="text-xs text-indigo-300 font-mono">{lookupResult.phonetic}</span>
                    )}
                    <button
                      onClick={() => speakText(lookupResult.word)}
                      className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                    >
                      🔊
                    </button>
                  </div>
                  <p className="text-sm text-emerald-300 font-medium">{lookupResult.translation}</p>
                  {lookupResult.definition && (
                    <p className="text-xs text-white/70">{lookupResult.definition}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveToVocabulary(lookupResult)}
                    disabled={!!savedWordsMap[lookupResult.word.toLowerCase().trim()]}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      savedWordsMap[lookupResult.word.toLowerCase().trim()]
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                    }`}
                  >
                    {savedWordsMap[lookupResult.word.toLowerCase().trim()]
                      ? '✓ შენახულია Vocabulary-ში'
                      : '+ Save to Vocabulary'}
                  </button>
                  <button
                    onClick={() => {
                      setLookupResult(null);
                      setLookupError('');
                    }}
                    className="p-2 text-xs text-white/50 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODE 1: FREE WRITING STUDIO                                           */}
        {/* ===================================================================== */}
        {mode === 'free' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Editor */}
            <div className="lg:col-span-5 space-y-4 rounded-2xl bg-white/[0.03] border border-white/10 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-white">📝 შენი ტექსტი</h2>
                <button
                  onClick={handleSparkPrompt}
                  className="text-xs px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-purple-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🎲</span>
                  <span>შემომთავაზე თემა</span>
                </button>
              </div>

              {/* Optional Topic Input */}
              <div>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="თემა ან სიტუაცია (სურვილისამებრ)..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/35 focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Main Textarea */}
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder={`დაწერე ნებისმიერ თემაზე ინგლისურად...\n\nთუ რაიმე სიტყვა ან ფრაზა არ გახსენდება, პირდაპირ ქართულად ჩაწერე:\nმაგ: "Yesterday I wanted to call him, მაგრამ გადავიფიქრე because it was too late."`}
                  className="w-full bg-black/40 border border-white/15 rounded-2xl p-4 text-sm text-white placeholder-white/30 leading-relaxed focus:outline-none focus:border-purple-400 resize-y"
                />
              </div>

              {/* Action Bar: Voice Dictation + Evaluate */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleVoiceInput('free')}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-2 ${
                    isListening
                      ? 'bg-red-500/20 border-red-400 text-red-300 animate-pulse'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80'
                  }`}
                >
                  <span>🎤</span>
                  <span>{isListening ? 'მიმდინარეობს ჩაწერა... (გაჩერება)' : 'ხმით კარნახი (Speak)'}</span>
                </button>

                <button
                  onClick={handleEvaluateWriting}
                  disabled={evaluating || !text.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>✨</span>
                  <span>{evaluating ? 'AI ამოწმებს...' : 'შემოწმება და გარჩევა'}</span>
                </button>
              </div>

              {evalError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {evalError}
                </div>
              )}
            </div>

            {/* Right Column: AI Coaching Results */}
            <div className="lg:col-span-7 space-y-5">
              {evaluating && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-12 flex items-center justify-center">
                  <LoadingSpinner message="AI აანალიზებს შენს ტექსტს, ასწორებს გრამატიკას და ამზადებს სასაუბრო ვერსიებს..." />
                </div>
              )}

              {!evaluating && !evalResult && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-10 text-center space-y-3">
                  <div className="text-4xl">✨</div>
                  <h3 className="text-base font-semibold text-white/80">
                    დაწერე ან ილაპარაკე თავისუფლად
                  </h3>
                  <p className="text-xs text-white/45 max-w-md mx-auto leading-relaxed">
                    AI შეგიმოწმებს გრამატიკას, გაჩვენებს როგორ იტყოდა ამავე აზრს მშობლიური ენის მატარებელი საუბრისას,
                    და ნებისმიერ წესზე შეგეძლება იქვე დააჭირო <span className="text-indigo-300">„🔍 რატომ? / ჩაეძიე“</span>.
                  </p>
                </div>
              )}

              {!evaluating && evalResult && (
                <>
                  {/* Overall Summary & CEFR Badge */}
                  <div className="rounded-2xl bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">
                        🎓 AI შეფასება
                      </span>
                      <span className="px-3 py-1 rounded-full bg-purple-500/25 border border-purple-400/40 text-xs font-bold text-purple-200">
                        დონე: {evalResult.cefr_level}
                      </span>
                    </div>
                    <p className="text-sm text-white/90 leading-relaxed">{evalResult.overall_feedback}</p>
                  </div>

                  {/* 3-Tier Rewrites (Corrected / Natural Spoken / Elevated) */}
                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setActiveRewriteTab('spoken')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            activeRewriteTab === 'spoken'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white/5 text-white/60 hover:text-white'
                          }`}
                        >
                          🗣️ Natural Spoken (სასაუბრო)
                        </button>
                        <button
                          onClick={() => setActiveRewriteTab('corrected')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            activeRewriteTab === 'corrected'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/5 text-white/60 hover:text-white'
                          }`}
                        >
                          ✅ Grammar Corrected (გასწორებული)
                        </button>
                        <button
                          onClick={() => setActiveRewriteTab('elevated')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            activeRewriteTab === 'elevated'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white/5 text-white/60 hover:text-white'
                          }`}
                        >
                          ✨ Elevated (დახვეწილი)
                        </button>
                      </div>

                      <button
                        onClick={() =>
                          speakText(
                            activeRewriteTab === 'spoken'
                              ? evalResult.natural_spoken_text
                              : activeRewriteTab === 'corrected'
                                ? evalResult.corrected_text
                                : evalResult.elevated_text,
                          )
                        }
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>🔊</span>
                        <span>მოსმენა</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-sm sm:text-base leading-relaxed text-white/95">
                      {renderInteractiveText(
                        activeRewriteTab === 'spoken'
                          ? evalResult.natural_spoken_text
                          : activeRewriteTab === 'corrected'
                            ? evalResult.corrected_text
                            : evalResult.elevated_text,
                      )}
                    </div>
                    <p className="text-[11px] text-white/40">
                      💡 დააჭირე ტექსტში ნებისმიერ სიტყვას სათარგმნად და Vocabulary-ში შესანახად.
                    </p>
                  </div>

                  {/* Specific Corrections with "🔍 რატომ? / ჩაეძიე" */}
                  {evalResult.corrections.length > 0 && (
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <span>🛠️</span>
                        <span>შესწორებები და დეტალური ჩაძიება ({evalResult.corrections.length})</span>
                      </h3>

                      <div className="space-y-3">
                        {evalResult.corrections.map((item: CorrectionItem, idx: number) => {
                          const threadId = `eval-corr-${idx}`;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-red-300/90 line-through bg-red-500/10 px-2 py-0.5 rounded">
                                    {item.original}
                                  </span>
                                  <span className="text-white/40">➔</span>
                                  <span className="text-emerald-300 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                                    {renderInteractiveText(item.corrected)}
                                  </span>
                                  <button
                                    onClick={() => speakText(item.corrected)}
                                    className="text-xs text-white/50 hover:text-white px-1.5 py-0.5 rounded bg-white/5 cursor-pointer"
                                    title="მოსმენა"
                                  >
                                    🔊
                                  </button>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      askDeepDive(
                                        threadId,
                                        item.original,
                                        item.corrected,
                                        evalResult.corrected_text,
                                      )
                                    }
                                    className="px-3 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-xs font-semibold text-indigo-200 transition-colors cursor-pointer flex items-center gap-1"
                                  >
                                    <span>🔍</span>
                                    <span>რატომ? / ჩაეძიე</span>
                                  </button>
                                </div>
                              </div>

                              {item.short_explanation && (
                                <p className="text-xs text-white/70 leading-relaxed">
                                  💡 {item.short_explanation}
                                </p>
                              )}

                              {renderDeepDiveThread(
                                threadId,
                                item.original,
                                item.corrected,
                                evalResult.corrected_text,
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ask AI Tutor About Any Custom Part of the Text */}
                  <div className="rounded-2xl bg-indigo-950/30 border border-indigo-500/25 p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-indigo-200 flex items-center gap-2">
                      <span>🎓</span>
                      <span>გაქვს კითხვა ნებისმიერ წინადადებაზე ან გრამატიკულ ფორმაზე?</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={customExplainPhrase}
                        onChange={(e) => setCustomExplainPhrase(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customExplainPhrase.trim()) {
                            askDeepDive(
                              'custom-free-question',
                              text,
                              evalResult.corrected_text,
                              evalResult.natural_spoken_text,
                              customExplainPhrase,
                            );
                            setCustomExplainPhrase('');
                          }
                        }}
                        placeholder="დასვი ნებისმიერი კითხვა (მაგ: რატომ გამოიყენე 'would have' მეორე წინადადებაში?)..."
                        className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        onClick={() => {
                          if (!customExplainPhrase.trim()) return;
                          askDeepDive(
                            'custom-free-question',
                            text,
                            evalResult.corrected_text,
                            evalResult.natural_spoken_text,
                            customExplainPhrase,
                          );
                          setCustomExplainPhrase('');
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                      >
                        🔍 ამიხსენი
                      </button>
                    </div>
                    {renderDeepDiveThread(
                      'custom-free-question',
                      text,
                      evalResult.corrected_text,
                      evalResult.natural_spoken_text,
                    )}
                  </div>

                  {/* Speaking Connectors */}
                  {evalResult.speaking_connectors && evalResult.speaking_connectors.length > 0 && (
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-white">
                        🔗 სასაუბრო ხიდები (Speaking Connectors)
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {evalResult.speaking_connectors.map((sc, idx) => {
                          const isSaved = !!savedWordsMap[sc.phrase.toLowerCase().trim()];
                          return (
                            <div
                              key={idx}
                              className="rounded-xl bg-black/30 border border-white/10 p-3.5 space-y-1.5 flex flex-col justify-between"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-emerald-300">
                                    {sc.phrase}
                                  </span>
                                  <button
                                    onClick={() => speakText(sc.phrase)}
                                    className="text-xs text-white/50 hover:text-white px-1.5 py-0.5 rounded bg-white/5 cursor-pointer"
                                  >
                                    🔊
                                  </button>
                                </div>
                                <p className="text-xs text-white/70">{sc.meaning}</p>
                                {sc.example && (
                                  <p className="text-xs text-white/50 italic">"{sc.example}"</p>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  handleSaveToVocabulary({
                                    word: sc.phrase,
                                    translation: sc.meaning,
                                    definition: sc.meaning,
                                    sentence_context: sc.example,
                                  })
                                }
                                disabled={isSaved}
                                className={`mt-2 self-start text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  isSaved
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                    : 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-400/30 text-purple-200'
                                }`}
                              >
                                {isSaved ? '✓ შენახულია' : '+ Vocabulary'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Suggested Vocabulary Cards */}
                  {evalResult.suggested_words && evalResult.suggested_words.length > 0 && (
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-white">
                        🗂️ რეკომენდებული სიტყვები და ფრაზები Vocabulary-სთვის
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {evalResult.suggested_words.map((sw, idx) => {
                          const key = sw.word.toLowerCase().trim();
                          const isSaved = !!savedWordsMap[key];
                          return (
                            <div
                              key={idx}
                              className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-2 flex flex-col justify-between"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-purple-300">{sw.word}</span>
                                  <button
                                    onClick={() => speakText(sw.word)}
                                    className="text-xs text-white/50 hover:text-white px-1.5 py-0.5 rounded bg-white/5 cursor-pointer"
                                  >
                                    🔊
                                  </button>
                                </div>
                                {sw.phonetic && (
                                  <p className="text-[11px] text-white/40 font-mono">{sw.phonetic}</p>
                                )}
                                <p className="text-xs text-emerald-300 font-medium">{sw.translation}</p>
                                {sw.definition && (
                                  <p className="text-xs text-white/60">{sw.definition}</p>
                                )}
                                {sw.sentence_context && (
                                  <p className="text-xs text-white/50 italic mt-1">
                                    "{sw.sentence_context}"
                                  </p>
                                )}
                              </div>

                              <button
                                onClick={() => handleSaveToVocabulary(sw)}
                                disabled={isSaved || !!savingWordMap[key]}
                                className={`mt-2 w-full py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                  isSaved
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                    : 'bg-purple-600/30 hover:bg-purple-600/50 border-purple-400/40 text-white'
                                }`}
                              >
                                {isSaved ? '✓ შენახულია Vocabulary-ში' : '+ Save to Vocabulary'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODE 2: AI ROLEPLAY & LIVE CONVERSATION                               */}
        {/* ===================================================================== */}
        {mode === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Scenario Selector */}
            <div className="lg:col-span-4 space-y-4 rounded-2xl bg-white/[0.03] border border-white/10 p-5">
              <h2 className="text-base font-semibold text-white">🎭 აირჩიე სცენარი</h2>
              <div className="space-y-2">
                {ROLEPLAY_SCENARIOS.map((sc) => {
                  const active = selectedScenarioId === sc.id && !customScenario.trim();
                  return (
                    <button
                      key={sc.id}
                      onClick={() => {
                        setSelectedScenarioId(sc.id);
                        setCustomScenario('');
                        startNewChat(sc.prompt);
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        active
                          ? 'bg-purple-600/25 border-purple-400 text-white shadow-lg shadow-purple-600/15'
                          : 'bg-black/30 border-white/10 text-white/75 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <span>{sc.icon}</span>
                        <span>{sc.title}</span>
                      </div>
                      <p className="text-xs text-white/50 mt-1">{sc.desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Custom Scenario */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <label className="text-xs font-semibold text-white/70 block">
                  ✨ ან შექმენი შენი სცენარი:
                </label>
                <input
                  type="text"
                  value={customScenario}
                  onChange={(e) => setCustomScenario(e.target.value)}
                  placeholder="მაგ: განვიხილოთ კოსმოსში მოგზაურობა..."
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-white/35 focus:outline-none focus:border-purple-400"
                />
                <button
                  onClick={() => startNewChat()}
                  disabled={chatLoading}
                  className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  🔄 ახალი დიალოგის დაწყება
                </button>
              </div>
            </div>

            {/* Right Column: Live Chat Window */}
            <div className="lg:col-span-8 rounded-2xl bg-white/[0.03] border border-white/10 p-5 flex flex-col space-y-4">
              {/* Conversation Stream */}
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {chatTurns.map((turn) => (
                  <div key={turn.id} className="space-y-2">
                    <div
                      className={`flex ${
                        turn.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 space-y-2 ${
                          turn.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-purple-400/30 text-white'
                            : 'bg-black/40 border border-white/10 text-white/95'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-50">
                            {turn.role === 'user' ? 'შენ' : '🤖 AI Partner'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => speakText(turn.content)}
                              className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                              title="მოსმენა"
                            >
                              🔊
                            </button>
                            {turn.role === 'assistant' && turn.translation && (
                              <button
                                onClick={() =>
                                  setChatTurns((prev) =>
                                    prev.map((t) =>
                                      t.id === turn.id
                                        ? { ...t, showTranslation: !t.showTranslation }
                                        : t,
                                    ),
                                  )
                                }
                                className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-purple-200 cursor-pointer"
                              >
                                {turn.showTranslation ? 'თარგმნის დამალვა' : 'GEO თარგმანი'}
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-sm sm:text-base leading-relaxed">
                          {renderInteractiveText(turn.content)}
                        </p>

                        {turn.showTranslation && turn.translation && (
                          <p className="text-xs text-purple-200/80 pt-2 border-t border-white/10">
                            🇬🇪 {turn.translation}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Coaching Feedback Card right under the User's message */}
                    {turn.role === 'user' && turn.feedback && (
                      <div className="ml-auto max-w-[85%] rounded-xl bg-indigo-950/40 border border-indigo-400/25 p-3.5 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-indigo-300">
                            {turn.feedback.is_perfect
                              ? '✅ იდეალური და ბუნებრივი წინადადებაა!'
                              : '💡 AI Coach-ის რჩევა:'}
                          </span>
                          <button
                            onClick={() =>
                              askDeepDive(
                                `chat-dive-${turn.id}`,
                                turn.content,
                                turn.feedback?.corrected || turn.content,
                                turn.feedback?.natural_alternative || turn.content,
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 font-semibold cursor-pointer"
                          >
                            🔍 რატომ? / ჩაეძიე
                          </button>
                        </div>

                        {!turn.feedback.is_perfect && turn.feedback.corrected && (
                          <div className="space-y-1">
                            <div>
                              <span className="text-white/50">გასწორებული: </span>
                              <span className="text-emerald-300 font-medium">
                                {renderInteractiveText(turn.feedback.corrected)}
                              </span>
                            </div>
                            {turn.feedback.natural_alternative && (
                              <div>
                                <span className="text-white/50">🗣️ საუბრისას იტყოდნენ: </span>
                                <span className="text-purple-200 font-medium">
                                  {renderInteractiveText(turn.feedback.natural_alternative)}
                                </span>
                                <button
                                  onClick={() => speakText(turn.feedback!.natural_alternative)}
                                  className="ml-1.5 text-white/50 hover:text-white cursor-pointer"
                                >
                                  🔊
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {turn.feedback.short_explanation && (
                          <p className="text-white/70">{turn.feedback.short_explanation}</p>
                        )}

                        {/* Suggested words from this chat turn */}
                        {turn.feedback.suggested_words &&
                          turn.feedback.suggested_words.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {turn.feedback.suggested_words.map((sw, i) => {
                                const isSaved = !!savedWordsMap[sw.word.toLowerCase().trim()];
                                return (
                                  <button
                                    key={i}
                                    onClick={() => handleSaveToVocabulary(sw)}
                                    disabled={isSaved}
                                    className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 cursor-pointer ${
                                      isSaved
                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                        : 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-400/30 text-purple-200'
                                    }`}
                                  >
                                    <span>{isSaved ? '✓' : '+ Vocabulary:'}</span>
                                    <span className="font-semibold">{sw.word}</span>
                                    {sw.translation && (
                                      <span className="opacity-70">({sw.translation})</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                        {renderDeepDiveThread(
                          `chat-dive-${turn.id}`,
                          turn.content,
                          turn.feedback.corrected || turn.content,
                          turn.feedback.natural_alternative || turn.content,
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {chatLoading && (
                  <div className="py-4">
                    <LoadingSpinner message="AI პასუხობს და ამოწმებს შენს მესიჯს..." />
                  </div>
                )}

                {chatError && (
                  <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl">{chatError}</p>
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="pt-3 border-t border-white/10 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleVoiceInput('chat')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isListening
                      ? 'bg-red-500/20 border-red-400 text-red-300 animate-pulse'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80'
                  }`}
                  title="ხმით პასუხი (Speak)"
                >
                  🎤
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !chatLoading) {
                      handleSendChatMessage();
                    }
                  }}
                  placeholder="მიწერე პასუხი ინგლისურად (ან ჩაურთე ქართული სიტყვა, თუ გაიჭედე)..."
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder-white/35 focus:outline-none focus:border-purple-400"
                />
                <button
                  onClick={handleSendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-sm font-semibold text-white cursor-pointer"
                >
                  გაგზავნა
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
