import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type UILanguage = 'ka' | 'en';

export interface Translations {
  // Navigation & General
  navLibrary: string;
  navWriting: string;
  navVocabulary: string;
  navSignOut: string;
  back: string;
  loading: string;
  cancel: string;
  save: string;
  delete: string;
  edit: string;
  close: string;
  search: string;

  // Library & Upload
  myLibrary: string;
  discoverContent: string;
  clickToUpload: string;
  dragAndDrop: string;
  pdfOrEpub: string;
  uploadingAndProcessing: string;
  libraryEmpty: string;
  libraryEmptyDesc: string;
  deleteBookConfirm: string;
  deleteBookTitle: string;
  booksCount: string;

  // Discover & Read Hub
  discoverBannerTitle: string;
  discoverBannerDesc: string;
  customTopicPlaceholder: string;
  createCustomBtn: string;
  feedLoading: string;
  feedErrorRetry: string;
  minRead: string;
  selectAndRead: string;

  // Categories
  catAi: string;
  catDotnet: string;
  catPython: string;
  catArchitecture: string;
  catWorld: string;
  catPsychology: string;
  catScience: string;
  catCulture: string;
  catPodcasts: string;
  catStories: string;

  // Import Modal
  modalTitle: string;
  step1Format: string;
  formatOriginalTitle: string;
  formatOriginalDesc: string;
  formatAdaptedTitle: string;
  formatAdaptedDesc: string;
  formatPodcastTitle: string;
  formatPodcastDesc: string;
  formatStoryTitle: string;
  formatStoryDesc: string;
  step2Cefr: string;
  cefrA2Desc: string;
  cefrB1Desc: string;
  cefrB2Desc: string;
  cefrC1Desc: string;
  includeOriginalCheckbox: string;
  btnPreparing: string;
  btnOpenOriginal: string;
  btnOpenPodcast: string;
  btnOpenStory: string;
  btnOpenAdapted: string;

  // Vocabulary Page
  vocabTitle: string;
  vocabTotal: string;
  vocabMastered: string;
  vocabLearning: string;
  vocabPlayAll: string;
  vocabPlayBook: string;
  vocabEmpty: string;
  vocabEmptyDesc: string;
  vocabAllBooks: string;
  vocabGoToBook: string;
  vocabPracticeWords: string;
  vocabLearned: string;
  vocabMarkLearned: string;
  vocabPronounce: string;

  // Writing Page
  writingTitle: string;
  writingSubtitle: string;
  writingTabFree: string;
  writingTabChat: string;
  writingTabHistory: string;
  writingRandomPrompt: string;
  writingYourText: string;
  writingWordCount: string;
  writingTopicPlaceholder: string;
  writingPlaceholder: string;
  writingHint: string;
  writingVoiceTyping: string;
  writingVoiceListening: string;
  writingClear: string;
  writingCheckBtn: string;
  writingChecking: string;
  writingRewriteSpoken: string;
  writingRewriteCorrected: string;
  writingRewriteElevated: string;
  writingCorrectionsTitle: string;
  writingDeepDiveBtn: string;
  writingDeepDivePlaceholder: string;
  writingDeepDiveAsk: string;
  writingVocabularyTitle: string;
  writingSavedToVocab: string;
  writingSaveToVocab: string;
  writingConnectorsTitle: string;
  writingChatScenarioSelect: string;
  writingChatScenarioCustom: string;
  writingChatCustomPlaceholder: string;
  writingChatStartCustom: string;
  writingChatInputPlaceholder: string;
  writingChatSend: string;
  writingChatThinking: string;
  writingChatYou: string;
  writingChatAi: string;
  writingChatInSpeech: string;
  writingHistoryTitle: string;
  writingNoSavedTopics: string;
  writingNoSavedTopicsDesc: string;
  writingDiagnosticTitle: string;
  writingDiagnosticDesc: string;
  writingAnalyzeBtn: string;
  writingAnalyzing: string;
  writingTrend: string;
  writingWhyMistake: string;
  writingGoldenRule: string;
  writingExamplesFromEssays: string;
  writingTargetedDrill: string;
  writingDrillHint: string;
  writingDrillPlaceholder: string;
  writingShowAnswer: string;
  writingHideAnswer: string;
  writingAiVerify: string;
  writingCorrectAnswer: string;
  writingOpenEssay: string;
  writingDeleteConfirm: string;
  writingCorrectionsCount: string;
}

const translations: Record<UILanguage, Translations> = {
  ka: {
    // Navigation & General
    navLibrary: 'ბიბლიოთეკა',
    navWriting: 'Writing',
    navVocabulary: 'Vocabulary',
    navSignOut: 'გასვლა',
    back: 'უკან',
    loading: 'იტვირთება...',
    cancel: 'გაუქმება',
    save: 'შენახვა',
    delete: 'წაშლა',
    edit: 'რედაქტირება',
    close: 'დახურვა',
    search: 'ძებნა',

    // Library & Upload
    myLibrary: 'ჩემი ბიბლიოთეკა',
    discoverContent: 'აღმოაჩინე მასალა (B1 / Tech / Podcasts / Stories)',
    clickToUpload: 'დააჭირეთ ასატვირთად',
    dragAndDrop: 'ან ჩააგდეთ ფაილი აქ',
    pdfOrEpub: 'მხოლოდ PDF ან EPUB ფაილები',
    uploadingAndProcessing: 'იტვირთება და მუშავდება...',
    libraryEmpty: 'თქვენი ბიბლიოთეკა ჯერ ცარიელია',
    libraryEmptyDesc: 'ატვირთეთ PDF/EPUB წიგნი ან გადადით ჩანართზე',
    deleteBookConfirm: 'დარწმუნებული ხართ, რომ გსურთ წიგნის წაშლა?',
    deleteBookTitle: 'წიგნის წაშლა',
    booksCount: 'წიგნი',

    // Discover & Read Hub
    discoverBannerTitle: 'თანამედროვე სტატიები, პოდკასტები და მოთხრობები',
    discoverBannerDesc: 'აირჩიეთ ნებისმიერი მასალა და გახსენით ორიგინალში, მოარგეთ B1/B2 დონეს, ან გადააქციეთ სასაუბრო პოდკასტ-დიალოგად.',
    customTopicPlaceholder: 'ან ჩაწერეთ თქვენი თემა / მოთხრობის იდეა...',
    createCustomBtn: '+ შექმნა',
    feedLoading: 'მოაქვს უახლესი მასალები...',
    feedErrorRetry: 'თავიდან ცდა',
    minRead: 'წთ',
    selectAndRead: 'არჩევა & კითხვა →',

    // Categories
    catAi: 'AI & LLMs',
    catDotnet: '.NET & C#',
    catPython: 'Python',
    catArchitecture: 'სისტემის არქიტექტურა',
    catWorld: 'მსოფლიო & ამბები',
    catPsychology: 'ფსიქოლოგია & ჩვევები',
    catScience: 'მეცნიერება & კოსმოსი',
    catCulture: 'კულტურა & ცხოვრება',
    catPodcasts: 'პოდკასტები & დისკუსიები',
    catStories: 'მოთხრობები (Stories)',

    // Import Modal
    modalTitle: 'ტექსტის ადაპტაცია & Reader-ში გადატანა',
    step1Format: '1. აირჩიეთ კითხვის ფორმატი:',
    formatOriginalTitle: 'ორიგინალი (Original Article)',
    formatOriginalDesc: 'სრული ორიგინალი ტექსტი უცვლელად, როგორც ავტორმა დაწერა.',
    formatAdaptedTitle: 'B1 / B2 ადაპტაცია (Smart Graded)',
    formatAdaptedDesc: 'AI მოარგებს ტექსტს თქვენს დონეს: ბუნებრივი ლექსიკა + ახსნები.',
    formatPodcastTitle: 'პოდკასტი (Spoken Conversation)',
    formatPodcastDesc: 'ორი წამყვანის (Alex & Sam) ცოცხალი საუბარი და დისკუსია თემაზე.',
    formatStoryTitle: 'მოთხრობა (Short Story)',
    formatStoryDesc: 'თანამედროვე მხატვრული მოთხრობა ბუნებრივი დიალოგებით.',
    step2Cefr: '2. აირჩიეთ ენის დონე (CEFR Level):',
    cefrA2Desc: 'მარტივი ყოველდღიური ენა',
    cefrB1Desc: 'რეკომენდებული — ბუნებრივი და გასაგები',
    cefrB2Desc: 'უფრო მდიდარი კონსტრუქციები',
    cefrC1Desc: 'პროფესიული და აკადემიური სტილი',
    includeOriginalCheckbox: 'მეორე თავად (Chapter 2) მოაყოლე ორიგინალი ტექსტიც შესადარებლად',
    btnPreparing: 'მზადდება Reader-ისთვის...',
    btnOpenOriginal: 'ორიგინალის გახსნა Reader-ში',
    btnOpenPodcast: 'პოდკასტის ({level}) გახსნა Reader-ში',
    btnOpenStory: 'მოთხრობის ({level}) გახსნა Reader-ში',
    btnOpenAdapted: 'მორგება ({level}) & გახსნა Reader-ში',

    // Vocabulary Page
    vocabTitle: 'ჩემი ლექსიკონი (Vocabulary)',
    vocabTotal: 'სულ',
    vocabMastered: 'ნასწავლი',
    vocabLearning: 'სასწავლი',
    vocabPlayAll: 'თამაში ყველა წიგნიდან',
    vocabPlayBook: 'ამ წიგნის სიტყვებით თამაში',
    vocabEmpty: 'ლექსიკონი ჯერ ცარიელია',
    vocabEmptyDesc: 'წიგნის კითხვისას მონიშნეთ და შეინახეთ სიტყვები',
    vocabAllBooks: 'ყველა წიგნი',
    vocabGoToBook: 'წიგნზე გადასვლა →',
    vocabPracticeWords: 'ამ წიგნის სიტყვების ვარჯიში',
    vocabLearned: 'ნასწავლია',
    vocabMarkLearned: 'ვიცი',
    vocabPronounce: 'გამოთქმა',

    // Writing Page
    writingTitle: 'Writing Studio',
    writingSubtitle: 'თავისუფალი წერა, ცოცხალი დიალოგი, გრამატიკაში ჩაძიება და Vocabulary-ს შევსება',
    writingTabFree: 'თავისუფალი წერა',
    writingTabChat: 'AI როლური დიალოგი',
    writingTabHistory: 'თემები & სუსტი წერტილები',
    writingRandomPrompt: 'შემთხვევითი თემა',
    writingYourText: 'შენი ტექსტი',
    writingWordCount: 'სიტყვა',
    writingTopicPlaceholder: 'თემა / სათაური (არასავალდებულო)...',
    writingPlaceholder: 'დაწერე ნებისმიერ თემაზე ინგლისურად...\n\nთუ რაიმე სიტყვა ან ფრაზა არ გახსენდება, პირდაპირ ქართულად ჩაწერე:\nმაგ: "Yesterday I wanted to call him, მაგრამ გადავიფიქრე because it was too late."',
    writingHint: 'რჩევა: თუ წერისას სიტყვა არ გახსენდება, პირდაპირ ქართულად ჩაწერე — AI თარგმნის და აგიხსნის!',
    writingVoiceTyping: 'ხმოვანი კარნახი (Voice Typing)',
    writingVoiceListening: 'გისმენ... ისაუბრე ინგლისურად',
    writingClear: 'გასუფთავება',
    writingCheckBtn: '🚀 გრამატიკის & სტილის შემოწმება',
    writingChecking: 'AI აანალიზებს შენს ტექსტს, ასწორებს გრამატიკას და ამზადებს სასაუბრო ვერსიებს...',
    writingRewriteSpoken: '🗣️ სასაუბრო ვარიანტი (Spoken)',
    writingRewriteCorrected: '✅ შესწორებული (Corrected)',
    writingRewriteElevated: '✨ დახვეწილი (Elevated)',
    writingCorrectionsTitle: 'ნაპოვნი შეცდომები & გაუმჯობესებები',
    writingDeepDiveBtn: '🔍 რატომ? / ჩაეძიე',
    writingDeepDivePlaceholder: 'ჩაეკითხე შენი სიტყვებით (მაგ: აქ Present Perfect რატომ არ წავა?)...',
    writingDeepDiveAsk: 'ამიხსენი',
    writingVocabularyTitle: 'რეკომენდებული სიტყვები და ფრაზები Vocabulary-სთვის',
    writingSavedToVocab: '✓ შენახულია Vocabulary-ში',
    writingSaveToVocab: '+ Save to Vocabulary',
    writingConnectorsTitle: 'სასაუბრო კონექტორები (დააკლიკე ჩასასმელად)',
    writingChatScenarioSelect: 'აირჩიე სცენარი',
    writingChatScenarioCustom: '✨ ან შექმენი შენი სცენარი:',
    writingChatCustomPlaceholder: 'მაგ: აეროპორტში ჩემოდნის დაკარგვა, სამსახურის გასაუბრება...',
    writingChatStartCustom: 'დაწყება',
    writingChatInputPlaceholder: 'მიწერე პასუხი ინგლისურად (ან ჩაურთე ქართული სიტყვა, თუ გაიჭედე)...',
    writingChatSend: 'გაგზავნა',
    writingChatThinking: 'AI პასუხობს და ამოწმებს შენს მესიჯს...',
    writingChatYou: 'შენ',
    writingChatAi: 'AI Partner',
    writingChatInSpeech: 'საუბრისას იტყოდნენ:',
    writingHistoryTitle: 'შენახული თემები',
    writingNoSavedTopics: 'ჯერ შენახული თემები არ გაქვს.',
    writingNoSavedTopicsDesc: 'როდესაც Free Writing-ში ტექსტს შეამოწმებ, ის ავტომატურად შეინახება აქ.',
    writingDiagnosticTitle: 'საერთო პრობლემების ანალიზი & პრაქტიკული ფიქსი',
    writingDiagnosticDesc: 'AI გადახედავს შენს ყველა შენახულ თემას, იპოვის განმეორებად შეცდომებს, აგიხსნის „ოქროს წესს“ და მოგცემს წერტილოვან სავარჯიშოებს.',
    writingAnalyzeBtn: 'გააანალიზე ჩემი სუსტი წერტილები',
    writingAnalyzing: 'AI სწავლობს შენს თემებს, აჯგუფებს შეცდომებს და ამზადებს პერსონალურ სავარჯიშოებს...',
    writingTrend: 'ტრენდი',
    writingWhyMistake: '❓ რატომ მოგდის ეს შეცდომა:',
    writingGoldenRule: '💡 ოქროს წესი / სოლუშენი:',
    writingExamplesFromEssays: '📌 მაგალითები შენი თემებიდან:',
    writingTargetedDrill: '🏋️ პრაქტიკული ფიქსი (გადათარგმნე / გაასწორე წესის მიხედვით):',
    writingDrillHint: 'მინიშნება:',
    writingDrillPlaceholder: 'ჩაწერე შენი ვერსია ინგლისურად...',
    writingShowAnswer: '✓ პასუხის ნახვა',
    writingHideAnswer: 'დამალვა',
    writingAiVerify: '🔍 AI შემოწმება',
    writingCorrectAnswer: '✅ სწორი პასუხი:',
    writingOpenEssay: '📖 სრულად გახსნა',
    writingDeleteConfirm: 'წავშალოთ ეს თემა ისტორიიდან?',
    writingCorrectionsCount: 'შესწორება',
  },
  en: {
    // Navigation & General
    navLibrary: 'Library',
    navWriting: 'Writing',
    navVocabulary: 'Vocabulary',
    navSignOut: 'Sign Out',
    back: 'Back',
    loading: 'Loading...',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    search: 'Search',

    // Library & Upload
    myLibrary: 'My Library',
    discoverContent: 'Discover Content (B1 / Tech / Podcasts / Stories)',
    clickToUpload: 'Click to upload',
    dragAndDrop: 'or drag and drop',
    pdfOrEpub: 'PDF or EPUB files only',
    uploadingAndProcessing: 'Uploading and processing...',
    libraryEmpty: 'Your library is empty',
    libraryEmptyDesc: 'Upload a PDF/EPUB book or explore our Discover feed',
    deleteBookConfirm: 'Are you sure you want to delete this book?',
    deleteBookTitle: 'Delete book',
    booksCount: 'books',

    // Discover & Read Hub
    discoverBannerTitle: 'Modern Articles, Podcasts & Stories',
    discoverBannerDesc: 'Pick any topic to read in the original, adapt to B1/B2 levels, or convert into a conversational podcast dialogue.',
    customTopicPlaceholder: 'Or enter your own topic or story idea...',
    createCustomBtn: '+ Create',
    feedLoading: 'Fetching latest content...',
    feedErrorRetry: 'Try again',
    minRead: 'min',
    selectAndRead: 'Select & Read →',

    // Categories
    catAi: 'AI & LLMs',
    catDotnet: '.NET & C#',
    catPython: 'Python',
    catArchitecture: 'System Design',
    catWorld: 'World & News',
    catPsychology: 'Psychology & Habits',
    catScience: 'Science & Space',
    catCulture: 'Culture & Life',
    catPodcasts: 'Podcasts & Discussions',
    catStories: 'Stories',

    // Import Modal
    modalTitle: 'Content Adaptation & Reader Import',
    step1Format: '1. Select Reading Format:',
    formatOriginalTitle: 'Original (Original Article)',
    formatOriginalDesc: 'Full original content as authored by the creator.',
    formatAdaptedTitle: 'B1 / B2 Adaptation (Smart Graded)',
    formatAdaptedDesc: 'AI adapts vocabulary and sentence complexity to your chosen level.',
    formatPodcastTitle: 'Podcast (Spoken Conversation)',
    formatPodcastDesc: 'A lively dialogue between two hosts (Alex & Sam) exploring the topic.',
    formatStoryTitle: 'Short Story',
    formatStoryDesc: 'A modern engaging fictional story with natural everyday dialogue.',
    step2Cefr: '2. Select CEFR Level:',
    cefrA2Desc: 'Simple everyday vocabulary',
    cefrB1Desc: 'Recommended — natural & accessible',
    cefrB2Desc: 'Richer sentence structures',
    cefrC1Desc: 'Advanced & professional style',
    includeOriginalCheckbox: 'Include original text as Chapter 2 for comparison',
    btnPreparing: 'Preparing for Reader...',
    btnOpenOriginal: 'Open Original in Reader',
    btnOpenPodcast: 'Open Podcast ({level}) in Reader',
    btnOpenStory: 'Open Story ({level}) in Reader',
    btnOpenAdapted: 'Adapt ({level}) & Open in Reader',

    // Vocabulary Page
    vocabTitle: 'My Vocabulary',
    vocabTotal: 'Total',
    vocabMastered: 'Mastered',
    vocabLearning: 'Learning',
    vocabPlayAll: 'Practice all words',
    vocabPlayBook: 'Practice this book',
    vocabEmpty: 'Vocabulary is empty',
    vocabEmptyDesc: 'Highlight and save words while reading books',
    vocabAllBooks: 'All Books',
    vocabGoToBook: 'Open book →',
    vocabPracticeWords: 'Practice words from this book',
    vocabLearned: 'Mastered',
    vocabMarkLearned: 'Know',
    vocabPronounce: 'Pronounce',

    // Writing Page
    writingTitle: 'Writing Studio',
    writingSubtitle: 'Free writing, live dialogue, grammar deep-dives, and vocabulary building',
    writingTabFree: 'Free Writing',
    writingTabChat: 'Roleplay Chat',
    writingTabHistory: 'Topics & Weak Spots',
    writingRandomPrompt: 'Random Prompt',
    writingYourText: 'Your Text',
    writingWordCount: 'words',
    writingTopicPlaceholder: 'Topic / Title (optional)...',
    writingPlaceholder: 'Write about any topic in English...\n\nIf you get stuck on a word or phrase, feel free to insert Georgian:\ne.g. "Yesterday I wanted to call him, მაგრამ გადავიფიქრე because it was too late."',
    writingHint: 'Tip: If you get stuck on a word or phrase, type it in Georgian — AI will translate and explain it!',
    writingVoiceTyping: 'Voice Typing',
    writingVoiceListening: 'Listening... speak in English',
    writingClear: 'Clear',
    writingCheckBtn: '🚀 Check Grammar & Style',
    writingChecking: 'AI is analyzing your writing, fixing grammar, and generating spoken alternatives...',
    writingRewriteSpoken: '🗣️ Natural Spoken',
    writingRewriteCorrected: '✅ Corrected',
    writingRewriteElevated: '✨ Elevated',
    writingCorrectionsTitle: 'Corrections & Improvements',
    writingDeepDiveBtn: '🔍 Why? / Deep Dive',
    writingDeepDivePlaceholder: 'Ask your follow-up question (e.g. why not Present Perfect here?)...',
    writingDeepDiveAsk: 'Explain',
    writingVocabularyTitle: 'Recommended Words & Phrases for Vocabulary',
    writingSavedToVocab: '✓ Saved to Vocabulary',
    writingSaveToVocab: '+ Save to Vocabulary',
    writingConnectorsTitle: 'Speaking Connectors (Click to insert)',
    writingChatScenarioSelect: 'Choose a Scenario',
    writingChatScenarioCustom: '✨ Or create your own scenario:',
    writingChatCustomPlaceholder: 'e.g. lost luggage at airport, job interview...',
    writingChatStartCustom: 'Start',
    writingChatInputPlaceholder: 'Reply in English (or insert Georgian words if stuck)...',
    writingChatSend: 'Send',
    writingChatThinking: 'AI is responding and checking your message...',
    writingChatYou: 'You',
    writingChatAi: 'AI Partner',
    writingChatInSpeech: 'In natural speech:',
    writingHistoryTitle: 'Saved Topics',
    writingNoSavedTopics: 'No saved essays yet.',
    writingNoSavedTopicsDesc: 'When you check your writing in Free Studio, it is automatically saved here.',
    writingDiagnosticTitle: 'Pattern Analysis & Targeted Practice',
    writingDiagnosticDesc: 'AI will review all your saved essays, find recurring mistakes, explain the golden rules, and create targeted drills.',
    writingAnalyzeBtn: 'Analyze My Weak Spots',
    writingAnalyzing: 'AI is reviewing your essays and preparing personalized drills...',
    writingTrend: 'Trend',
    writingWhyMistake: '❓ Why this mistake happens:',
    writingGoldenRule: '💡 Golden Rule / Solution:',
    writingExamplesFromEssays: '📌 Examples from your essays:',
    writingTargetedDrill: '🏋️ Targeted Drill (Translate / fix according to rule):',
    writingDrillHint: 'Hint:',
    writingDrillPlaceholder: 'Type your version in English...',
    writingShowAnswer: '✓ Show Answer',
    writingHideAnswer: 'Hide',
    writingAiVerify: '🔍 AI Check',
    writingCorrectAnswer: '✅ Correct Answer:',
    writingOpenEssay: '📖 Open Full Essay',
    writingDeleteConfirm: 'Delete this essay from history?',
    writingCorrectionsCount: 'corrections',
  },
};

interface LanguageContextType {
  lang: UILanguage;
  setLang: (lang: UILanguage) => void;
  toggleLang: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const STORAGE_KEY = 'ls_ui_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UILanguage>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ka') return saved;
    // Default to Georgian
    return 'ka';
  });

  const setLang = useCallback((newLang: UILanguage) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = prev === 'ka' ? 'en' : 'ka';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = {
    lang,
    setLang,
    toggleLang,
    t: translations[lang],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
