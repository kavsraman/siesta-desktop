import { useState, useEffect, useCallback, useRef } from "react";
import { getVocabulary, updateWordStage, toggleFavorite, LANGUAGES, VocabWord } from "../utils/storage";

interface FlashcardProps {
  onBack: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

function Flashcard({ onBack, language, onLanguageChange }: FlashcardProps) {
  const [words, setWords] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  const advance = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % words.length);
    setFlipped(false);
  }, [words.length]);

  const handleKnow = useCallback(async () => {
    if (!words[currentIndex] || !language) return;
    await updateWordStage(words[currentIndex].english, "acquired", language);
    advance();
  }, [words, currentIndex, language, advance]);

  const handleSkip = useCallback(() => {
    advance();
  }, [advance]);

  const wordCountRef = useRef(0);

  useEffect(() => {
    (async () => {
      setCurrentIndex(0);
      setFlipped(false);
      const vocab = await getVocabulary(language);
      setWords(vocab.length > 0 ? vocab : []);
      wordCountRef.current = vocab.length;
    })();
  }, [language]);

  // Auto-refresh: poll for new words every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const vocab = await getVocabulary(language);
      if (vocab.length !== wordCountRef.current) {
        wordCountRef.current = vocab.length;
        setWords(vocab.length > 0 ? vocab : []);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [language]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
      if (e.key === "ArrowRight") handleKnow();
      if (e.key === "ArrowLeft") handleSkip();
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, handleKnow, handleSkip]);

  const currentWord = words[currentIndex];

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setHasDragged(false);
    setStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    setDragX(dx);
    if (Math.abs(dx) > 5) setHasDragged(true);
  };

  const handleMouseUp = async () => {
    if (!dragging) return;
    setDragging(false);

    if (Math.abs(dragX) > 80) {
      if (dragX > 0 && currentWord && language) {
        await updateWordStage(currentWord.english, "acquired", language);
      }
      advance();
    }
    setDragX(0);
  };

  const handleCardClick = () => {
    if (!hasDragged) setFlipped(!flipped);
  };

  const handleToggleFavorite = async () => {
    if (!currentWord || !language) return;
    await toggleFavorite(currentWord.english, language);
    const updated = await getVocabulary(language);
    if (updated.length > 0) {
      setWords(updated);
    }
  };

  const topBar = (
    <div className="view-topbar">
      <button className="back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>
      <span className="view-topbar-title">Flashcards</span>
      <select
        className="topbar-lang-switcher"
        value={language}
        onChange={(e) => onLanguageChange(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    </div>
  );

  if (!currentWord) {
    return (
      <div className="view-container">
        {topBar}
        <div className="flashcard-body">
          <div className="flashcard-empty">
            <p>No words yet</p>
            <p className="flashcard-hint">Start learning to build your deck</p>
          </div>
        </div>
      </div>
    );
  }

  const swipeColor = dragX > 40 ? "rgba(124,154,142,0.3)" : dragX < -40 ? "rgba(200,100,100,0.3)" : "transparent";

  return (
    <div className="view-container">
      {topBar}
      <div className="flashcard-body">
        <div
          className={`flashcard ${flipped ? "flipped" : ""}`}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX * 0.05}deg)`,
            background: swipeColor,
          }}
          onClick={handleCardClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {!flipped ? (
            <div className="flashcard-front">
              <span className="flashcard-word">{currentWord.english}</span>
              <span className="flashcard-tap">tap to flip</span>
            </div>
          ) : (
            <div className="flashcard-back">
              <span className="flashcard-translation">{currentWord.translation}</span>
              <span className="flashcard-pronunciation">{currentWord.pronunciation}</span>
            </div>
          )}
        </div>

        <div className="flashcard-buttons">
          <button className="flashcard-btn flashcard-btn-skip" onClick={handleSkip}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Still Learning
          </button>
          <button className="flashcard-btn flashcard-btn-know" onClick={handleKnow}>
            I Know This
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="flashcard-actions">
          <div className="flashcard-progress">
            {currentIndex + 1} / {words.length}
          </div>
          <button
            className={`favorite-btn ${currentWord.favorited ? "favorited" : ""}`}
            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(); }}
            title={currentWord.favorited ? "Remove from favorites" : "Add to favorites"}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 15.5s-6.5-4.35-6.5-8.18A3.32 3.32 0 0 1 5.82 4 3.32 3.32 0 0 1 9 5.71 3.32 3.32 0 0 1 12.18 4a3.32 3.32 0 0 1 3.32 3.32c0 3.83-6.5 8.18-6.5 8.18Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={currentWord.favorited ? "currentColor" : "none"}
              />
            </svg>
          </button>
        </div>

        <div className="flashcard-swipe-hints">
          <span className="swipe-left">&larr; swipe or press left</span>
          <span className="swipe-right">swipe or press right &rarr;</span>
        </div>
      </div>
    </div>
  );
}

export default Flashcard;
