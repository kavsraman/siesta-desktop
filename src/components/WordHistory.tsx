import { useState, useEffect } from "react";
import { getSettings, getWordHistory, getVocabulary, toggleFavorite, WordOfTheHour, VocabWord } from "../utils/storage";

interface WordHistoryProps {
  onBack: () => void;
}

function WordHistory({ onBack }: WordHistoryProps) {
  const [history, setHistory] = useState<WordOfTheHour[]>([]);
  const [vocab, setVocab] = useState<VocabWord[]>([]);
  const [lang, setLang] = useState("");

  useEffect(() => {
    loadData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const loadData = async () => {
    const settings = await getSettings();
    const language = settings.language;
    setLang(language);
    const [h, v] = await Promise.all([
      getWordHistory(language),
      getVocabulary(language),
    ]);
    setHistory(h);
    setVocab(v);
  };

  const isFavorited = (english: string) => {
    return vocab.find((w) => w.english === english)?.favorited ?? false;
  };

  const handleToggleFavorite = async (english: string) => {
    if (!lang) return;
    await toggleFavorite(english, lang);
    const updated = await getVocabulary(lang);
    setVocab(updated);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="view-container">
      <div className="view-topbar">
        <button className="back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <span className="view-topbar-title">Word History</span>
        <span className="view-topbar-spacer" />
      </div>

      <div className="word-history-list">
        {history.length === 0 ? (
          <div className="word-history-empty">
            <p>No words yet</p>
            <p className="word-history-hint">Words will appear here as they're delivered</p>
          </div>
        ) : (
          history.map((word, i) => (
            <div key={i} className="word-history-item">
              <div className="word-history-info">
                <span className="word-history-translation">{word.translation}</span>
                <span className="word-history-english">{word.english}</span>
                <span className="word-history-pronunciation">{word.pronunciation}</span>
                <span className="word-history-time">{formatTime(word.deliveredAt)}</span>
              </div>
              <button
                className={`favorite-btn ${isFavorited(word.english) ? "favorited" : ""}`}
                onClick={() => handleToggleFavorite(word.english)}
                title={isFavorited(word.english) ? "Remove from favorites" : "Add to favorites"}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 15.5s-6.5-4.35-6.5-8.18A3.32 3.32 0 0 1 5.82 4 3.32 3.32 0 0 1 9 5.71 3.32 3.32 0 0 1 12.18 4a3.32 3.32 0 0 1 3.32 3.32c0 3.83-6.5 8.18-6.5 8.18Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill={isFavorited(word.english) ? "currentColor" : "none"}
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default WordHistory;
