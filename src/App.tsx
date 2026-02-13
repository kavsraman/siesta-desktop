import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Lookup from "./components/Lookup";
import Flashcard from "./components/Flashcard";
import Settings from "./components/Settings";
import Toast from "./components/Toast";
import LatestWord from "./components/LatestWord";
import WordHistory from "./components/WordHistory";
import DailyQuiz from "./components/DailyQuiz";
import SkillStars from "./components/SkillStars";
import ActiveLanguages from "./components/ActiveLanguages";
import {
  getVocabulary,
  getSkillLevel,
  getSettings,
  saveSettings,
  getWordHistory,
  addWordOfTheHour,
  getFavorites,
  toggleFavorite,
  migrateGlobalDataToPerLanguage,
  getAllLanguageSummaries,
  LANGUAGES,
  WordOfTheHour,
  VocabWord,
  LanguageSummary,
} from "./utils/storage";

type View = "home" | "lookup" | "flashcard" | "settings" | "word-history" | "quiz" | "favorites";

function App() {
  const [view, setView] = useState<View>("home");
  const [toastText, setToastText] = useState<string | null>(null);
  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const [vocabCounts, setVocabCounts] = useState({ total: 0, exposed: 0, familiar: 0, acquired: 0 });
  const [skillLevel, setSkillLevel] = useState(0);
  const [latestWord, setLatestWord] = useState<WordOfTheHour | null>(null);
  const [favorites, setFavorites] = useState<VocabWord[]>([]);
  const [language, setLanguage] = useState("Italian");
  const [darkMode, setDarkMode] = useState(false);
  const [langSummaries, setLangSummaries] = useState<LanguageSummary[]>([]);

  const refreshData = async (lang: string) => {
    const vocab = await getVocabulary(lang);
    const total = vocab.length;
    const exposed = vocab.filter((w) => w.stage === "exposed").length;
    const familiar = vocab.filter((w) => w.stage === "familiar").length;
    const acquired = vocab.filter((w) => w.stage === "acquired").length;
    setVocabCounts({ total, exposed, familiar, acquired });

    const level = await getSkillLevel(lang);
    setSkillLevel(level);

    const history = await getWordHistory(lang);
    if (history.length > 0) {
      setLatestWord(history[0]);
    } else {
      setLatestWord(null);
    }

    const favs = await getFavorites(lang);
    setFavorites(favs);

    const summaries = await getAllLanguageSummaries();
    setLangSummaries(summaries);
  };

  useEffect(() => {
    (async () => {
      await migrateGlobalDataToPerLanguage();

      const settings = await getSettings();
      const lang = settings.language;
      setLanguage(lang);
      setDarkMode(settings.darkMode);
      document.documentElement.setAttribute("data-theme", settings.darkMode ? "dark" : "light");

      await refreshData(lang);

      if (settings.notificationInterval > 0) {
        // Calculate remaining time before next word based on last delivery
        const history = await getWordHistory(lang);
        let initialDelaySecs = 0;
        if (history.length > 0) {
          const lastDeliveredMs = new Date(history[0].deliveredAt).getTime();
          const intervalMs = settings.notificationInterval * 60 * 1000;
          const elapsedMs = Date.now() - lastDeliveredMs;
          const remainingMs = intervalMs - elapsedMs;
          if (remainingMs > 0) {
            initialDelaySecs = Math.ceil(remainingMs / 1000);
          }
        }

        invoke("start_word_timer", {
          language: lang,
          intervalMinutes: settings.notificationInterval,
          initialDelaySecs,
        }).catch(() => {});
      }
    })();

    const unlistenSettings = listen("open-settings", () => setView("settings"));
    const unlistenClipboard = listen<string>("clipboard-text", (event) => {
      setToastText(event.payload);
    });
    const unlistenToggle = listen("toggle-clipboard", () => {
      setClipboardEnabled((prev) => !prev);
    });

    const unlistenNewWord = listen<WordOfTheHour>("new-word-of-hour", async (event) => {
      const settings = await getSettings();
      const word: WordOfTheHour = {
        english: (event.payload as any).english,
        translation: (event.payload as any).translation,
        pronunciation: (event.payload as any).pronunciation,
        deliveredAt: new Date(Number((event.payload as any).deliveredAt) || Date.now()).toISOString(),
      };
      await addWordOfTheHour(word, settings.language);
      setLatestWord(word);
    });

    return () => {
      unlistenSettings.then((fn) => fn());
      unlistenClipboard.then((fn) => fn());
      unlistenToggle.then((fn) => fn());
      unlistenNewWord.then((fn) => fn());
    };
  }, []);

  // Refresh data when returning to home
  useEffect(() => {
    if (view === "home") {
      refreshData(language);
    }
  }, [view, language]);

  const goHome = () => setView("home");

  const handleLanguageChange = async (newLang: string) => {
    setLanguage(newLang);
    const settings = await getSettings();
    await saveSettings({ ...settings, language: newLang });

    // Restart word timer with new language
    invoke("stop_word_timer").catch(() => {});
    if (settings.notificationInterval > 0) {
      const history = await getWordHistory(newLang);
      let initialDelaySecs = 0;
      if (history.length > 0) {
        const lastDeliveredMs = new Date(history[0].deliveredAt).getTime();
        const intervalMs = settings.notificationInterval * 60 * 1000;
        const elapsedMs = Date.now() - lastDeliveredMs;
        const remainingMs = intervalMs - elapsedMs;
        if (remainingMs > 0) {
          initialDelaySecs = Math.ceil(remainingMs / 1000);
        }
      }

      invoke("start_word_timer", {
        language: newLang,
        intervalMinutes: settings.notificationInterval,
        initialDelaySecs,
      }).catch(() => {});
    }

    await refreshData(newLang);
  };

  const handleDarkModeToggle = async () => {
    const newDark = !darkMode;
    setDarkMode(newDark);
    document.documentElement.setAttribute("data-theme", newDark ? "dark" : "light");
    const settings = await getSettings();
    await saveSettings({ ...settings, darkMode: newDark });
  };

  const pctExposed = vocabCounts.total > 0 ? (vocabCounts.exposed / vocabCounts.total) * 100 : 0;
  const pctFamiliar = vocabCounts.total > 0 ? (vocabCounts.familiar / vocabCounts.total) * 100 : 0;
  const pctAcquired = vocabCounts.total > 0 ? (vocabCounts.acquired / vocabCounts.total) * 100 : 0;

  const handleToggleFavorite = async (english: string) => {
    await toggleFavorite(english, language);
    const favs = await getFavorites(language);
    setFavorites(favs);
  };

  return (
    <div className="app-container">
      {view === "home" && (
        <>
          <header className="app-header">
            <div className="header-row">
              <div className="header-left">
                <button
                  className="dark-mode-toggle"
                  onClick={handleDarkModeToggle}
                  title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {darkMode ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M13.8 4.2l-1.4 1.4M5.6 12.4l-1.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M15.1 10.4A6.5 6.5 0 0 1 7.6 2.9 6.5 6.5 0 1 0 15.1 10.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="header-center">
                <h1 className="app-title">siesta</h1>
                <p className="app-subtitle">immersive language companion</p>
              </div>
              <div className="header-right">
                <select
                  className="language-switcher"
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
            </div>
          </header>

          <main className="app-main">
            <LatestWord word={latestWord} onSeeMore={() => setView("word-history")} />

            <div className="tile-grid">
              <button className="tile" onClick={() => setView("lookup")}>
                <div className="tile-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="2.2" />
                    <line x1="20.5" y1="20.5" x2="27" y2="27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="tile-label">Quick Lookup</span>
                <kbd className="tile-shortcut">&#8984;&#8679;O</kbd>
              </button>

              <button
                className={`tile ${clipboardEnabled ? "tile-active" : ""}`}
                onClick={() => setClipboardEnabled(!clipboardEnabled)}
              >
                <div className="tile-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="8" y="4" width="16" height="24" rx="2.5" stroke="currentColor" strokeWidth="2.2" />
                    <rect x="12" y="2" width="8" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="var(--bg)" />
                    <line x1="12" y1="13" x2="20" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="12" y1="17" x2="18" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="12" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="tile-label">Clipboard Monitor</span>
                <span className={`tile-status ${clipboardEnabled ? "on" : ""}`}>
                  {clipboardEnabled ? "On" : "Off"}
                </span>
              </button>

              <button className="tile" onClick={() => setView("flashcard")}>
                <div className="tile-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="6" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2.2" />
                    <path d="M4 12h24" stroke="currentColor" strokeWidth="1.5" />
                    <text x="16" y="22" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="600" fontFamily="Inter, system-ui">Aa</text>
                  </svg>
                </div>
                <span className="tile-label">Flashcards</span>
              </button>

              <button className="tile" onClick={() => setView("quiz")}>
                <div className="tile-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2.2" />
                    <text x="16" y="21" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="600" fontFamily="Inter, system-ui">?</text>
                  </svg>
                </div>
                <span className="tile-label">Daily Quiz</span>
              </button>

              <button className="tile" onClick={() => setView("favorites")}>
                <div className="tile-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <path
                      d="M16 27s-11.5-7.7-11.5-14.5a5.88 5.88 0 0 1 5.88-5.88A5.88 5.88 0 0 1 16 10.1a5.88 5.88 0 0 1 5.62-3.48 5.88 5.88 0 0 1 5.88 5.88C27.5 19.3 16 27 16 27Z"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </div>
                <span className="tile-label">Favorites</span>
                {favorites.length > 0 && (
                  <span className="tile-badge">{favorites.length}</span>
                )}
              </button>

              <button className="tile" onClick={() => setView("settings")}>
                <div className="tile-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <path
                      d="M13.7 4h4.6l.6 3.2a8.4 8.4 0 0 1 2.1 1.2l3.1-1 2.3 4-2.5 2.1a8.5 8.5 0 0 1 0 2.5l2.5 2.1-2.3 4-3.1-1a8.4 8.4 0 0 1-2.1 1.2L18.3 28h-4.6l-.6-3.2a8.4 8.4 0 0 1-2.1-1.2l-3.1 1-2.3-4 2.5-2.1a8.5 8.5 0 0 1 0-2.5L5.6 14l2.3-4 3.1 1a8.4 8.4 0 0 1 2.1-1.2L13.7 4Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <circle cx="16" cy="16" r="3.5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <span className="tile-label">Settings</span>
              </button>
            </div>

            <div className="vocab-bar">
              <div className="vocab-bar-header">
                <span className="vocab-bar-title">Vocabulary</span>
                <span className="vocab-bar-total">{vocabCounts.total} word{vocabCounts.total !== 1 ? "s" : ""}</span>
              </div>
              <div className="vocab-bar-track">
                <div className="vocab-bar-fill exposed" style={{ width: `${pctExposed}%` }} />
                <div className="vocab-bar-fill familiar" style={{ width: `${pctFamiliar}%` }} />
                <div className="vocab-bar-fill acquired" style={{ width: `${pctAcquired}%` }} />
              </div>
              <div className="vocab-bar-legend">
                <span className="legend-item"><span className="legend-dot exposed" />Exposed {vocabCounts.exposed}</span>
                <span className="legend-item"><span className="legend-dot familiar" />Familiar {vocabCounts.familiar}</span>
                <span className="legend-item"><span className="legend-dot acquired" />Acquired {vocabCounts.acquired}</span>
              </div>
            </div>

            <SkillStars level={skillLevel} />

            <ActiveLanguages
              summaries={langSummaries}
              currentLanguage={language}
              onSwitchLanguage={handleLanguageChange}
            />
          </main>
        </>
      )}

      {view === "lookup" && <Lookup onBack={goHome} />}
      {view === "flashcard" && <Flashcard onBack={goHome} />}
      {view === "settings" && <Settings onBack={goHome} />}
      {view === "word-history" && <WordHistory onBack={goHome} />}
      {view === "quiz" && <DailyQuiz onBack={goHome} />}
      {view === "favorites" && (
        <div className="view-container">
          <div className="view-topbar">
            <button className="back-btn" onClick={goHome}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            <span className="view-topbar-title">Favorites</span>
            <span className="view-topbar-spacer" />
          </div>
          <div className="favorites-list">
            {favorites.length === 0 ? (
              <div className="favorites-empty">
                <p>No favorites yet</p>
                <p className="favorites-hint">Tap the heart icon on any word to save it here</p>
              </div>
            ) : (
              favorites.map((word) => (
                <div key={word.english} className="word-history-item">
                  <div className="word-history-info">
                    <span className="word-history-translation">{word.translation}</span>
                    <span className="word-history-english">{word.english}</span>
                    <span className="word-history-pronunciation">{word.pronunciation}</span>
                  </div>
                  <button
                    className="favorite-btn favorited"
                    onClick={() => handleToggleFavorite(word.english)}
                    title="Remove from favorites"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M9 15.5s-6.5-4.35-6.5-8.18A3.32 3.32 0 0 1 5.82 4 3.32 3.32 0 0 1 9 5.71 3.32 3.32 0 0 1 12.18 4a3.32 3.32 0 0 1 3.32 3.32c0 3.83-6.5 8.18-6.5 8.18Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {toastText && (
        <Toast text={toastText} onDismiss={() => setToastText(null)} />
      )}
    </div>
  );
}

export default App;
