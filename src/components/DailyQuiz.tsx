import { useState, useEffect, useRef } from "react";
import { getSettings, getVocabulary, getFavorites, saveQuizResult, LANGUAGES, VocabWord } from "../utils/storage";

interface QuizQuestion {
  word: VocabWord;
  options: string[];
  correctIndex: number;
}

interface DailyQuizProps {
  onBack: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuiz(vocab: VocabWord[], favorites: VocabWord[]): QuizQuestion[] {
  if (vocab.length < 4) return [];

  const favSet = new Set(favorites.map((f) => f.english));
  const prioritized = [
    ...vocab.filter((w) => favSet.has(w.english)),
    ...vocab.filter((w) => !favSet.has(w.english) && w.stage !== "acquired"),
    ...vocab.filter((w) => !favSet.has(w.english) && w.stage === "acquired"),
  ];

  const seen = new Set<string>();
  const unique = prioritized.filter((w) => {
    if (seen.has(w.english)) return false;
    seen.add(w.english);
    return true;
  });

  const selected = unique.slice(0, 10);
  const allEnglish = vocab.map((w) => w.english);

  return shuffle(selected).map((word) => {
    const distractors: string[] = [];
    const pool = allEnglish.filter((e) => e !== word.english);
    const shuffledPool = shuffle(pool);
    for (let i = 0; i < 3 && i < shuffledPool.length; i++) {
      distractors.push(shuffledPool[i]);
    }

    const options = shuffle([word.english, ...distractors]);
    const correctIndex = options.indexOf(word.english);

    return { word, options, correctIndex };
  });
}

function DailyQuiz({ onBack, language, onLanguageChange }: DailyQuizProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const langRef = useRef("");

  useEffect(() => {
    loadQuiz();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const loadQuiz = async () => {
    const settings = await getSettings();
    const language = settings.language;
    langRef.current = language;
    const [vocab, favorites] = await Promise.all([
      getVocabulary(language),
      getFavorites(language),
    ]);
    const q = buildQuiz(vocab, favorites);
    setQuestions(q);
    setLoading(false);
  };

  const handleSelect = (index: number) => {
    if (selected !== null) return;
    setSelected(index);
    const correct = index === questions[currentQ].correctIndex;
    if (correct) setScore((s) => s + 1);

    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        const finalScore = correct ? score + 1 : score;
        setFinished(true);
        saveQuizResult({
          date: new Date().toISOString(),
          score: finalScore,
          total: questions.length,
        }, langRef.current);
      } else {
        setCurrentQ((q) => q + 1);
        setSelected(null);
      }
    }, 800);
  };

  const topBar = (
    <div className="view-topbar">
      <button className="back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>
      <span className="view-topbar-title">Daily Quiz</span>
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

  if (loading) {
    return (
      <div className="view-container">
        {topBar}
        <div className="quiz-body">
          <span className="quiz-loading">Loading quiz...</span>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="view-container">
        {topBar}
        <div className="quiz-body">
          <div className="quiz-empty">
            <p>Not enough words for a quiz</p>
            <p className="quiz-empty-hint">Learn at least 4 words to unlock the daily quiz</p>
          </div>
        </div>
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="view-container">
        {topBar}
        <div className="quiz-body">
          <div className="quiz-score">
            <span className="quiz-score-emoji">
              {pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "📚"}
            </span>
            <span className="quiz-score-value">{score} / {questions.length}</span>
            <span className="quiz-score-pct">{pct}% correct</span>
            <button className="quiz-done-btn" onClick={onBack}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];

  return (
    <div className="view-container">
      {topBar}
      <div className="quiz-body">
        <div className="quiz-progress">
          {currentQ + 1} / {questions.length}
        </div>

        <div className="quiz-prompt">
          <span className="quiz-prompt-label">What is the English for:</span>
          <span className="quiz-prompt-word">{q.word.translation}</span>
          {q.word.pronunciation && (
            <span className="quiz-prompt-pronunciation">{q.word.pronunciation}</span>
          )}
        </div>

        <div className="quiz-options">
          {q.options.map((option, i) => {
            let className = "quiz-option";
            if (selected !== null) {
              if (i === q.correctIndex) className += " correct";
              else if (i === selected) className += " wrong";
            }
            return (
              <button
                key={i}
                className={className}
                onClick={() => handleSelect(i)}
                disabled={selected !== null}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DailyQuiz;
