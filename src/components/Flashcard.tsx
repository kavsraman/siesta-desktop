import { useState, useEffect } from "react";
import { getSettings, getVocabulary, updateWordStage, toggleFavorite, VocabWord } from "../utils/storage";

interface FlashcardProps {
  onBack: () => void;
}

function Flashcard({ onBack }: FlashcardProps) {
  const [words, setWords] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [lang, setLang] = useState("");

  useEffect(() => {
    loadWords();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const loadWords = async () => {
    const settings = await getSettings();
    const language = settings.language;
    setLang(language);
    const vocab = await getVocabulary(language);
    if (vocab.length > 0) {
      setWords(vocab);
    } else {
      setWords([
        { english: "hello", translation: "ciao", pronunciation: "chow", stage: "exposed", seenCount: 1, favorited: false, addedAt: new Date().toISOString() },
        { english: "thank you", translation: "grazie", pronunciation: "GRAT-see-eh", stage: "exposed", seenCount: 1, favorited: false, addedAt: new Date().toISOString() },
        { english: "good morning", translation: "buongiorno", pronunciation: "bwon-JOR-no", stage: "exposed", seenCount: 1, favorited: false, addedAt: new Date().toISOString() },
        { english: "please", translation: "per favore", pronunciation: "pair fah-VOR-eh", stage: "exposed", seenCount: 1, favorited: false, addedAt: new Date().toISOString() },
        { english: "goodbye", translation: "arrivederci", pronunciation: "ah-ree-veh-DAIR-chee", stage: "exposed", seenCount: 1, favorited: false, addedAt: new Date().toISOString() },
      ]);
    }
  };

  const currentWord = words[currentIndex];

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setDragX(e.clientX - startX);
  };

  const handleMouseUp = async () => {
    if (!dragging) return;
    setDragging(false);

    if (Math.abs(dragX) > 80) {
      if (dragX > 0 && currentWord && lang) {
        await updateWordStage(currentWord.english, "acquired", lang);
      }
      setCurrentIndex((i) => (i + 1) % words.length);
      setFlipped(false);
    }
    setDragX(0);
  };

  const handleToggleFavorite = async () => {
    if (!currentWord || !lang) return;
    await toggleFavorite(currentWord.english, lang);
    const updated = await getVocabulary(lang);
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
      <span className="view-topbar-spacer" />
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
          onClick={() => setFlipped(!flipped)}
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
          <span className="swipe-left">&larr; still learning</span>
          <span className="swipe-right">I know this &rarr;</span>
        </div>
      </div>
    </div>
  );
}

export default Flashcard;
