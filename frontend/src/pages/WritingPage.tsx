import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import LanguageToggle from '../components/LanguageToggle';
import SettingsModal from '../components/SettingsModal';
import {
  evaluateWriting,
  sendWritingChat,
  explainWritingDeepDive,
  translateWritingWord,
  saveVocabularyWord,
  listWritingSubmissions,
  deleteWritingSubmission,
  analyzeWritingPatterns,
  logout,
  type EvaluateWritingResponse,
  type CorrectionItem,
  type SuggestedWordItem,
  type WritingChatMessage,
  type ChatUserFeedback,
  type DeepDiveExplainResponse,
  type WritingSubmissionItem,
  type PatternAnalysisResponse,
} from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

type StudioMode = 'free' | 'chat' | 'history';
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

const getRoleplayScenarios = (lang: string) => [
  {
    id: 'free',
    icon: '💬',
    title: lang === 'ka' ? 'თავისუფალი საუბარი (Free Talk)' : 'Free Talk & Casual Chat',
    desc: lang === 'ka' ? 'მეგობრული საუბარი ნებისმიერ თემაზე — ფილმები, იდეები, ყოველდღიურობა' : 'Friendly conversation about everyday life, movies, and ideas',
    prompt: 'Casual, friendly conversation with a curious friend about daily life, hobbies, movies, or ideas.',
  },
  {
    id: 'detective',
    icon: '🕵️',
    title: lang === 'ka' ? 'დეტექტიური გამოძიება (Mystery)' : 'Detective Mystery',
    desc: lang === 'ka' ? 'მუზეუმიდან ნახატი გაქრა — შენ ხარ დეტექტივი ან ეჭვმიტანილი' : 'A painting was stolen from the museum — you are the detective or suspect',
    prompt: 'A famous painting was stolen from the Grand Museum last night. Play a witty witness/suspect being questioned by the user, or challenge their alibi in a fun mystery roleplay.',
  },
  {
    id: 'debate',
    icon: '🎭',
    title: lang === 'ka' ? 'დებატები (Debate Me)' : 'Debate Me',
    desc: lang === 'ka' ? 'AI იცავს საპირისპირო პოზიციას და შენ შენი არგუმენტებით ეკამათები' : 'The AI defends the opposing view and you debate with arguments',
    prompt: 'Playful intellectual debate partner. Pick an interesting everyday controversy (e.g. remote work vs office, AI creativity, city vs nature) and challenge the user with sharp but friendly counterarguments.',
  },
  {
    id: 'travel',
    icon: '☕',
    title: lang === 'ka' ? 'მოგზაურობა და სიტუაციები (Real Life)' : 'Travel & Real Life Situations',
    desc: lang === 'ka' ? 'უცხო ქალაქში სასტუმროს, კაფეს ან დაკარგული ბარგის მოგვარება' : 'Handle hotel check-ins, cafes, or lost luggage in a new city',
    prompt: 'Roleplay a lively real-world travel situation: the user just arrived in London, their hotel reservation got mixed up or they are ordering at a busy local spot. Be helpful, realistic, and conversational.',
  },
  {
    id: 'interview',
    icon: '🚀',
    title: lang === 'ka' ? 'იდეის პრეზენტაცია / ინტერვიუ' : 'Project Pitch / Interview',
    desc: lang === 'ka' ? 'წარადგინე შენი პროექტი ან გაიარე საინტერესო გასაუბრება' : 'Pitch your project or complete an engaging interview',
    prompt: 'You are an enthusiastic podcast host or startup investor interviewing the user about their work, passions, or a cool project they are building.',
  },
];

const getQuickQuestions = (lang: string) =>
  lang === 'ka'
    ? [
        'გრამატიკული წესი დეტალურად ამიხსენი',
        'ჩემი ვერსია რატომ არის შეცდომა და როდის იქნებოდა სწორი?',
        'რა ნიუანსური სხვაობაა ჩემსა და შესწორებულ ვარიანტს შორის?',
        'მომეცი კიდევ 3 ბუნებრივი სასაუბრო მაგალითი',
      ]
    : [
        'Explain the grammar rule in detail',
        'Why was my phrasing incorrect and when would it be used?',
        'What is the nuance difference between my version and the correction?',
        'Give me 3 more natural spoken examples',
      ];

export default function WritingPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const settings = useSettings();
  const [mode, setMode] = useState<StudioMode>('free');

  const roleplayScenarios = useMemo(() => getRoleplayScenarios(lang), [lang]);
  const quickQuestions = useMemo(() => getQuickQuestions(lang), [lang]);

  // ── Free Writing State (with localStorage draft persistence) ──
  const [topic, setTopic] = useState(() => localStorage.getItem('ls_writing_draft_topic') || '');
  const [text, setText] = useState(() => localStorage.getItem('ls_writing_draft_text') || '');
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState('');
  const [evalResult, setEvalResult] = useState<EvaluateWritingResponse | null>(null);
  const [activeRewriteTab, setActiveRewriteTab] = useState<RewriteTab>('spoken');

  // ── Saved Writings History & Pattern Analysis State ──
  const [submissions, setSubmissions] = useState<WritingSubmissionItem[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [patternAnalysis, setPatternAnalysis] = useState<PatternAnalysisResponse | null>(null);
  const [analyzingPatterns, setAnalyzingPatterns] = useState(false);
  const [patternError, setPatternError] = useState('');
  const [drillInputs, setDrillInputs] = useState<Record<string, string>>({});
  const [drillRevealed, setDrillRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    localStorage.setItem('ls_writing_draft_topic', topic);
  }, [topic]);

  useEffect(() => {
    localStorage.setItem('ls_writing_draft_text', text);
  }, [text]);

  const fetchSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    try {
      const res = await listWritingSubmissions();
      setSubmissions(res.submissions);
    } catch {
      // ignore
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleAnalyzePatterns = useCallback(async () => {
    setAnalyzingPatterns(true);
    setPatternError('');
    try {
      const res = await analyzeWritingPatterns();
      setPatternAnalysis(res);
    } catch (err) {
      setPatternError(err instanceof Error ? err.message : 'ანალიზი ვერ მოხერხდა');
    } finally {
      setAnalyzingPatterns(false);
    }
  }, []);

  const handleDeleteSubmission = useCallback(async (id: number) => {
    if (!window.confirm(t.writingDeleteConfirm)) return;
    try {
      await deleteWritingSubmission(id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  }, [t.writingDeleteConfirm]);

  const handleLoadSubmissionIntoStudio = useCallback((sub: WritingSubmissionItem) => {
    setTopic(sub.topic || '');
    setText(sub.original_text);
    setEvalResult({
      submission_id: sub.id,
      corrected_text: sub.corrected_text,
      natural_spoken_text: sub.natural_spoken_text,
      elevated_text: sub.elevated_text,
      cefr_level: sub.cefr_level,
      overall_feedback: sub.overall_feedback,
      speaking_connectors: sub.speaking_connectors,
      corrections: sub.corrections,
      suggested_words: sub.suggested_words,
    });
    setOpenDeepDiveIds({});
    setDeepDiveThreads({});
    setMode('free');
  }, []);

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

  // ── Mobile Scenario Drawer toggle for Chat mode ──
  const [showMobileScenarios, setShowMobileScenarios] = useState(false);

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
      fetchSubmissions();
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'ანალიზი ვერ მოხერხდა');
    } finally {
      setEvaluating(false);
    }
  }, [text, topic, fetchSubmissions]);

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
      const scenarioObj = roleplayScenarios.find((s) => s.id === selectedScenarioId);
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
    [roleplayScenarios, selectedScenarioId, customScenario],
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

    const scenarioObj = roleplayScenarios.find((s) => s.id === selectedScenarioId);
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
            {t.close} ✕
          </button>
        </div>

        {/* Quick Question Chips */}
        <div className="flex flex-wrap gap-1.5">
          {quickQuestions.map((q) => (
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
            className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-base sm:text-xs text-white placeholder-white/40 focus:outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => askDeepDive(threadId, originalText, correctedText, contextSentence)}
            disabled={thread?.loading || !(thread?.customQuestion || '').trim()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
          >
            კითხვა
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/60 to-gray-950 text-white pb-20 sm:pb-8">
      {/* Header */}
      <header className="glass sticky top-0 z-40 px-3 sm:px-6 lg:px-8 py-2.5 min-h-14 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => navigate('/library')}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title={t.back}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg lg:text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent truncate">
              ✍️ {t.writingTitle}
            </h1>
            <p className="text-[11px] text-white/50 hidden md:block truncate">
              {t.writingSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <LanguageToggle />
          <button
            onClick={settings.openSettings}
            className="p-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 text-white"
            title={t.navSettings}
          >
            <span>⚙️</span>
            <span className="hidden md:inline">{t.navSettings}</span>
          </button>
          <button
            onClick={() => navigate('/library')}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-all cursor-pointer"
          >
            📚 <span className="hidden sm:inline">{t.navLibrary}</span>
          </button>
          <button
            onClick={() => navigate('/vocabulary')}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl border border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all cursor-pointer flex items-center gap-1"
          >
            <span>🗂️</span>
            <span className="hidden xs:inline sm:inline">{t.navVocabulary}</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm rounded-xl border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">{t.navSignOut}</span>
            <span className="sm:hidden">🚪</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Mode Switcher Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="grid grid-cols-3 sm:inline-flex p-1 rounded-2xl bg-white/5 border border-white/10 w-full sm:w-auto">
            <button
              onClick={() => setMode('free')}
              className={`px-2.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 ${
                mode === 'free'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <span>📝</span>
              <span className="truncate">{t.writingTabFree}</span>
            </button>
            <button
              onClick={() => {
                setMode('chat');
                if (chatTurns.length === 0 && !chatLoading) {
                  startNewChat();
                }
              }}
              className={`px-2.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 ${
                mode === 'chat'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <span>💬</span>
              <span className="truncate">{t.writingTabChat}</span>
            </button>
            <button
              onClick={() => {
                setMode('history');
                fetchSubmissions();
              }}
              className={`px-2.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 ${
                mode === 'history'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <span>📜</span>
              <span className="truncate">{t.writingTabHistory} ({submissions.length})</span>
            </button>
          </div>

          <div className="text-[11px] sm:text-xs text-white/50 bg-white/[0.03] border border-white/10 px-3 py-2 rounded-xl leading-relaxed">
            💡 {t.writingHint}
          </div>
        </div>

        {/* Word Lookup Floating Bottom Sheet / Popover (mobile & desktop friendly) */}
        {(lookupLoading || lookupResult || lookupError) && (
          <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[440px] z-50 rounded-2xl bg-gray-950/95 backdrop-blur-xl border border-indigo-400/50 p-4 shadow-2xl">
            {lookupLoading && <LoadingSpinner message="სიტყვა ითარგმნება..." />}
            {lookupError && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-red-400">{lookupError}</p>
                <button
                  onClick={() => setLookupError('')}
                  className="text-xs text-white/50 hover:text-white px-2 py-1"
                >
                  ✕
                </button>
              </div>
            )}
            {lookupResult && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
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
                      <p className="text-xs text-white/70 leading-relaxed">{lookupResult.definition}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setLookupResult(null);
                      setLookupError('');
                    }}
                    className="p-1.5 text-sm text-white/50 hover:text-white cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>

                <button
                  onClick={() => handleSaveToVocabulary(lookupResult)}
                  disabled={!!savedWordsMap[lookupResult.word.toLowerCase().trim()]}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    savedWordsMap[lookupResult.word.toLowerCase().trim()]
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                  }`}
                >
                  {savedWordsMap[lookupResult.word.toLowerCase().trim()]
                    ? t.writingSavedToVocab
                    : t.writingSaveToVocab}
                </button>
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
                <h2 className="text-base font-semibold text-white">📝 {t.writingYourText}</h2>
                <button
                  onClick={handleSparkPrompt}
                  className="text-xs px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-purple-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>🎲</span>
                  <span>{t.writingRandomPrompt}</span>
                </button>
              </div>

              {/* Optional Topic Input */}
              <div>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t.writingTopicPlaceholder}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-white/35 focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Main Textarea */}
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder={t.writingPlaceholder}
                  className="w-full bg-black/40 border border-white/15 rounded-2xl p-3.5 sm:p-4 text-base sm:text-sm text-white placeholder-white/30 leading-relaxed focus:outline-none focus:border-purple-400 resize-y"
                />
              </div>

              {/* Action Bar: Voice Dictation + Evaluate */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => toggleVoiceInput('free')}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    isListening
                      ? 'bg-red-500/20 border-red-400 text-red-300 animate-pulse'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80'
                  }`}
                >
                  <span>🎤</span>
                  <span>{isListening ? t.writingVoiceListening : t.writingVoiceTyping}</span>
                </button>

                <button
                  onClick={handleEvaluateWriting}
                  disabled={evaluating || !text.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>✨</span>
                  <span>{evaluating ? t.writingChecking : t.writingCheckBtn}</span>
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
                  <LoadingSpinner message={t.writingChecking} />
                </div>
              )}

              {!evaluating && !evalResult && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-10 text-center space-y-3">
                  <div className="text-4xl">✨</div>
                  <h3 className="text-base font-semibold text-white/80">
                    {lang === 'ka' ? 'დაწერე ან ილაპარაკე თავისუფლად' : 'Write or speak freely'}
                  </h3>
                  <p className="text-xs text-white/45 max-w-md mx-auto leading-relaxed">
                    {lang === 'ka'
                      ? 'AI შეგიმოწმებს გრამატიკას, გაჩვენებს როგორ იტყოდა ამავე აზრს მშობლიური ენის მატარებელი საუბრისას, და ნებისმიერ წესზე შეგეძლება იქვე დააჭირო „🔍 რატომ? / ჩაეძიე“.'
                      : 'AI will check your grammar, suggest how a native speaker would naturally phrase it, and allow you to deep-dive into any grammar rule.'}
                  </p>
                </div>
              )}

              {!evaluating && evalResult && (
                <>
                  {/* Overall Summary & CEFR Badge */}
                  <div className="rounded-2xl bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">
                        {lang === 'ka' ? '🎓 AI შეფასება' : '🎓 AI Evaluation'}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-purple-500/25 border border-purple-400/40 text-xs font-bold text-purple-200">
                        {lang === 'ka' ? 'დონე' : 'Level'}: {evalResult.cefr_level}
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
                          {t.writingRewriteSpoken}
                        </button>
                        <button
                          onClick={() => setActiveRewriteTab('corrected')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            activeRewriteTab === 'corrected'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/5 text-white/60 hover:text-white'
                          }`}
                        >
                          {t.writingRewriteCorrected}
                        </button>
                        <button
                          onClick={() => setActiveRewriteTab('elevated')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            activeRewriteTab === 'elevated'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white/5 text-white/60 hover:text-white'
                          }`}
                        >
                          {t.writingRewriteElevated}
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
                        <span>{lang === 'ka' ? 'მოსმენა' : 'Listen'}</span>
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
                      {lang === 'ka'
                        ? '💡 დააჭირე ტექსტში ნებისმიერ სიტყვას სათარგმნად და Vocabulary-ში შესანახად.'
                        : '💡 Click any word in the text to translate and save to Vocabulary.'}
                    </p>
                  </div>

                  {/* Specific Corrections with "🔍 რატომ? / ჩაეძიე" */}
                  {evalResult.corrections.length > 0 && (
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <span>🛠️</span>
                        <span>{t.writingCorrectionsTitle} ({evalResult.corrections.length})</span>
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
                                    title={lang === 'ka' ? 'მოსმენა' : 'Listen'}
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
                                    <span>{t.writingDeepDiveBtn}</span>
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
                      <span>
                        {lang === 'ka'
                          ? 'გაქვს კითხვა ნებისმიერ წინადადებაზე ან გრამატიკულ ფორმაზე?'
                          : 'Have a question about any sentence or grammar form?'}
                      </span>
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
                        placeholder={t.writingDeepDivePlaceholder}
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
                        🔍 {t.writingDeepDiveAsk}
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
                        🔗 {t.writingConnectorsTitle}
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
                                {isSaved ? (lang === 'ka' ? '✓ შენახულია' : '✓ Saved') : '+ Vocabulary'}
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
                        🗂️ {t.writingVocabularyTitle}
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
                                {isSaved ? t.writingSavedToVocab : t.writingSaveToVocab}
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
            {/* Left Sidebar: Scenario Selector (collapsible on mobile, always open on desktop) */}
            <div className="lg:col-span-4 space-y-3 sm:space-y-4 rounded-2xl bg-white/[0.03] border border-white/10 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                  <span>🎭</span>
                  <span>
                    {roleplayScenarios.find((s) => s.id === selectedScenarioId)?.title ||
                      t.writingChatScenarioSelect}
                  </span>
                </h2>
                <button
                  onClick={() => setShowMobileScenarios((prev) => !prev)}
                  className="lg:hidden px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold text-purple-200 cursor-pointer"
                >
                  {showMobileScenarios
                    ? (lang === 'ka' ? 'ჩაკეცვა ▲' : 'Collapse ▲')
                    : (lang === 'ka' ? 'შეცვლა ▼' : 'Change ▼')}
                </button>
              </div>

              <div className={`${showMobileScenarios ? 'block' : 'hidden'} lg:block space-y-3`}>
                <div className="space-y-2">
                  {roleplayScenarios.map((sc) => {
                    const active = selectedScenarioId === sc.id && !customScenario.trim();
                    return (
                      <button
                        key={sc.id}
                        onClick={() => {
                          setSelectedScenarioId(sc.id);
                          setCustomScenario('');
                          setShowMobileScenarios(false);
                          startNewChat(sc.prompt);
                        }}
                        className={`w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer ${
                          active
                            ? 'bg-purple-600/25 border-purple-400 text-white shadow-lg shadow-purple-600/15'
                            : 'bg-black/30 border-white/10 text-white/75 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
                          <span>{sc.icon}</span>
                          <span>{sc.title}</span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-white/50 mt-1">{sc.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Scenario */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <label className="text-xs font-semibold text-white/70 block">
                    {t.writingChatScenarioCustom}
                  </label>
                  <input
                    type="text"
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                    placeholder={t.writingChatCustomPlaceholder}
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-base sm:text-xs text-white placeholder-white/35 focus:outline-none focus:border-purple-400"
                  />
                  <button
                    onClick={() => {
                      setShowMobileScenarios(false);
                      startNewChat();
                    }}
                    disabled={chatLoading}
                    className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    {lang === 'ka' ? '🔄 ახალი დიალოგის დაწყება' : '🔄 Start New Chat'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Chat Window */}
            <div className="lg:col-span-8 rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 sm:p-5 flex flex-col space-y-4">
              {/* Conversation Stream */}
              <div className="space-y-4 max-h-[60vh] sm:max-h-[600px] overflow-y-auto pr-1">
                {chatTurns.map((turn) => (
                  <div key={turn.id} className="space-y-2">
                    <div
                      className={`flex ${
                        turn.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-3.5 sm:p-4 space-y-2 ${
                          turn.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-purple-400/30 text-white'
                            : 'bg-black/40 border border-white/10 text-white/95'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider opacity-50">
                            {turn.role === 'user' ? t.writingChatYou : t.writingChatAi}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => speakText(turn.content)}
                              className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                              title={lang === 'ka' ? 'მოსმენა' : 'Listen'}
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
                                {turn.showTranslation
                                  ? (lang === 'ka' ? 'თარგმნის დამალვა' : 'Hide translation')
                                  : (lang === 'ka' ? 'GEO თარგმანი' : 'Show translation')}
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
                              ? (lang === 'ka'
                                  ? '✅ იდეალური და ბუნებრივი წინადადებაა!'
                                  : '✅ Perfect and natural sentence!')
                              : (lang === 'ka' ? '💡 AI Coach-ის რჩევა:' : '💡 AI Coach Advice:')}
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
                            <span>{t.writingDeepDiveBtn}</span>
                          </button>
                        </div>

                        {!turn.feedback.is_perfect && turn.feedback.corrected && (
                          <div className="space-y-1">
                            <div>
                              <span className="text-white/50">{lang === 'ka' ? 'გასწორებული: ' : 'Corrected: '}</span>
                              <span className="text-emerald-300 font-medium">
                                {renderInteractiveText(turn.feedback.corrected)}
                              </span>
                            </div>
                            {turn.feedback.natural_alternative && (
                              <div>
                                <span className="text-white/50">🗣️ {t.writingChatInSpeech} </span>
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
                    <LoadingSpinner message={t.writingChatThinking} />
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
                  title={t.writingVoiceTyping}
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
                  placeholder={t.writingChatInputPlaceholder}
                  className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-xl px-3.5 sm:px-4 py-3 text-base sm:text-sm text-white placeholder-white/35 focus:outline-none focus:border-purple-400"
                />
                <button
                  onClick={handleSendChatMessage}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-4 sm:px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-xs sm:text-sm font-semibold text-white cursor-pointer shrink-0"
                >
                  {t.writingChatSend}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* MODE 3: SAVED WRITINGS HISTORY & WEAK SPOTS DIAGNOSTIC                */}
        {/* ===================================================================== */}
        {mode === 'history' && (
          <div className="space-y-6">
            {/* Top Diagnostic Card: Common Problems Analysis & Micro-Drills */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-950/60 via-purple-950/50 to-gray-950 border border-indigo-400/30 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>📊</span>
                    <span>{t.writingDiagnosticTitle}</span>
                  </h2>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {t.writingDiagnosticDesc}
                  </p>
                </div>

                <button
                  onClick={handleAnalyzePatterns}
                  disabled={analyzingPatterns || submissions.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer shrink-0 flex items-center justify-center gap-2"
                >
                  <span>🧠</span>
                  <span>
                    {analyzingPatterns
                      ? t.writingAnalyzing
                      : t.writingAnalyzeBtn}
                  </span>
                </button>
              </div>

              {analyzingPatterns && (
                <div className="py-6">
                  <LoadingSpinner message={t.writingAnalyzing} />
                </div>
              )}

              {patternError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {patternError}
                </div>
              )}

              {patternAnalysis && !analyzingPatterns && (
                <div className="space-y-5 pt-2 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-xl p-4">
                    <p className="text-sm text-white/90 leading-relaxed flex-1">
                      {patternAnalysis.overall_summary}
                    </p>
                    {patternAnalysis.level_trend && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-xs font-bold text-emerald-300 shrink-0">
                        📈 {t.writingTrend}: {patternAnalysis.level_trend}
                      </span>
                    )}
                  </div>

                  {/* Weak Spots List */}
                  <div className="grid grid-cols-1 gap-4">
                    {patternAnalysis.weak_spots.map((wsItem, wIdx) => (
                      <div
                        key={wIdx}
                        className="rounded-2xl bg-black/40 border border-white/15 p-4 sm:p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-purple-300 flex items-center gap-2">
                            <span>🎯</span>
                            <span>
                              #{wIdx + 1} {wsItem.category}
                            </span>
                          </h3>
                          {wsItem.frequency_label && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[11px] font-semibold text-amber-200">
                              {wsItem.frequency_label}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
                              {t.writingWhyMistake}
                            </span>
                            <p className="text-xs text-white/80 leading-relaxed">
                              {wsItem.why_it_happens}
                            </p>
                          </div>

                          <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-3.5 space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                              {t.writingGoldenRule}
                            </span>
                            <p className="text-xs text-emerald-100 font-medium leading-relaxed">
                              {wsItem.golden_rule}
                            </p>
                          </div>
                        </div>

                        {/* Examples from User's Own Writings */}
                        {wsItem.user_examples && wsItem.user_examples.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/60">
                              {t.writingExamplesFromEssays}
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {wsItem.user_examples.map((ex, eIdx) => (
                                <div
                                  key={eIdx}
                                  className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 text-xs space-y-1"
                                >
                                  <div className="text-red-300/85 line-through">❌ {ex.wrong}</div>
                                  <div className="text-emerald-300 font-medium">
                                    ✅ {renderInteractiveText(ex.right)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Interactive Micro-Drills to Fix the Habit */}
                        {wsItem.drills && wsItem.drills.length > 0 && (
                          <div className="pt-2 border-t border-white/10 space-y-3">
                            <span className="text-xs font-semibold text-indigo-300 block">
                              {t.writingTargetedDrill}
                            </span>
                            {wsItem.drills.map((drill, dIdx) => {
                              const drillKey = `drill-${wIdx}-${dIdx}`;
                              const userAttempt = drillInputs[drillKey] || '';
                              const isRevealed = !!drillRevealed[drillKey];

                              return (
                                <div
                                  key={dIdx}
                                  className="rounded-xl bg-indigo-950/30 border border-indigo-400/25 p-3.5 space-y-2.5"
                                >
                                  <div className="text-xs sm:text-sm text-white font-medium">
                                    {dIdx + 1}. {drill.prompt_ka}
                                  </div>
                                  {drill.hint && (
                                    <div className="text-[11px] text-indigo-300/80">
                                      {t.writingDrillHint} {drill.hint}
                                    </div>
                                  )}

                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                      type="text"
                                      value={userAttempt}
                                      onChange={(e) =>
                                        setDrillInputs((prev) => ({
                                          ...prev,
                                          [drillKey]: e.target.value,
                                        }))
                                      }
                                      placeholder={t.writingDrillPlaceholder}
                                      className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3.5 py-2 text-base sm:text-xs text-white placeholder-white/35 focus:outline-none focus:border-indigo-400"
                                    />
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() =>
                                          setDrillRevealed((prev) => ({
                                            ...prev,
                                            [drillKey]: !prev[drillKey],
                                          }))
                                        }
                                        className="px-3.5 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 text-xs font-semibold text-emerald-200 cursor-pointer"
                                      >
                                        {isRevealed ? t.writingHideAnswer : t.writingShowAnswer}
                                      </button>
                                      {userAttempt.trim() && (
                                        <button
                                          onClick={() =>
                                            askDeepDive(
                                              drillKey,
                                              userAttempt,
                                              drill.correct_answer,
                                              drill.prompt_ka,
                                              `Assignment: "${drill.prompt_ka}". I wrote: "${userAttempt}". Correct answer: "${drill.correct_answer}". Evaluate my attempt.`,
                                            )
                                          }
                                          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                                        >
                                          {t.writingAiVerify}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {isRevealed && (
                                    <div className="rounded-lg bg-black/40 border border-emerald-500/30 p-3 text-xs space-y-1">
                                      <div className="text-emerald-300 font-semibold flex items-center justify-between">
                                        <span>{t.writingCorrectAnswer} {renderInteractiveText(drill.correct_answer)}</span>
                                        <button
                                          onClick={() => speakText(drill.correct_answer)}
                                          className="px-1.5 py-0.5 rounded bg-white/10 text-white cursor-pointer"
                                        >
                                          🔊
                                        </button>
                                      </div>
                                      {drill.explanation_ka && (
                                        <p className="text-white/70">{drill.explanation_ka}</p>
                                      )}
                                    </div>
                                  )}

                                  {renderDeepDiveThread(
                                    drillKey,
                                    userAttempt || drill.prompt_ka,
                                    drill.correct_answer,
                                    drill.prompt_ka,
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Saved Submissions List */}
            <div className="space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>📜</span>
                <span>{t.writingHistoryTitle} ({submissions.length})</span>
              </h2>

              {loadingSubmissions && (
                <div className="py-10 flex justify-center">
                  <LoadingSpinner message={t.loading} />
                </div>
              )}

              {!loadingSubmissions && submissions.length === 0 && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-10 text-center space-y-2">
                  <p className="text-sm text-white/60">{t.writingNoSavedTopics}</p>
                  <p className="text-xs text-white/40">
                    {t.writingNoSavedTopicsDesc}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {submissions.map((sub) => (
                  <div
                    key={sub.id}
                    className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 flex flex-col justify-between space-y-4 hover:border-purple-400/30 transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-xs font-bold text-purple-200">
                          {sub.cefr_level}
                        </span>
                        <span className="text-[11px] text-white/40">
                          {sub.created_at
                            ? new Date(sub.created_at).toLocaleDateString(lang === 'ka' ? 'ka-GE' : 'en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>

                      {sub.topic && (
                        <h3 className="text-sm font-semibold text-purple-200 line-clamp-1">
                          📌 {sub.topic}
                        </h3>
                      )}

                      <p className="text-xs sm:text-sm text-white/85 line-clamp-3 leading-relaxed">
                        {sub.original_text}
                      </p>

                      {sub.overall_feedback && (
                        <p className="text-xs text-white/50 line-clamp-2">
                          💡 {sub.overall_feedback}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <span className="text-[11px] text-white/40">
                        🛠️ {sub.corrections.length} {t.writingCorrectionsCount}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleLoadSubmissionIntoStudio(sub)}
                          className="px-3.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-xs font-semibold text-white cursor-pointer"
                        >
                          {t.writingOpenEssay}
                        </button>
                        <button
                          onClick={() => handleDeleteSubmission(sub.id)}
                          className="p-1.5 rounded-xl hover:bg-red-500/20 text-red-400 text-xs cursor-pointer"
                          title={t.delete}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Global Settings Modal */}
      <SettingsModal
        isOpen={settings.isSettingsOpen}
        onClose={settings.closeSettings}
      />
    </div>
  );
}
