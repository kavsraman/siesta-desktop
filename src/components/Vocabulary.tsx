import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVocabulary, getSettings, addWord, deleteWord, toggleFavorite, getHiddenWords, LANGUAGES } from "../utils/storage";

interface BundledWord {
  word: string;
  pronunciation: string;
  native?: string;
}

interface DisplayWord {
  english: string;
  translation: string;
  pronunciation: string;
  native?: string;
  stage: string;
  favorited: boolean;
  source: "user" | "system";
}

interface WordDetail {
  translation: string;
  pronunciation: string;
  examples: string[];
  mnemonic: string;
  dialect_notes?: string;
}

type FilterMode = "all" | "user" | "system";

interface VocabularyProps {
  onBack: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

function parseResponse(raw: string): WordDetail {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  text = text.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        translation: parsed.translation || parsed.word || "",
        pronunciation: parsed.pronunciation || parsed.phonetic || "",
        examples: Array.isArray(parsed.examples)
          ? parsed.examples
          : parsed.example
            ? [parsed.example]
            : [],
        mnemonic: parsed.mnemonic || parsed.memory_tip || parsed.remember || "",
        dialect_notes: parsed.dialect_notes || parsed.dialects || parsed.notes || undefined,
      };
    } catch {
      // fall through
    }
  }

  return { translation: text, pronunciation: "", examples: [], mnemonic: "" };
}

function Vocabulary({ onBack, language, onLanguageChange }: VocabularyProps) {
  const [allWords, setAllWords] = useState<DisplayWord[]>([]);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [expandedWord, setExpandedWord] = useState<string | null>(null);
  const [wordDetails, setWordDetails] = useState<Record<string, WordDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const loadWords = async () => {
    const userVocab = await getVocabulary(language);
    const hiddenWords = new Set(getHiddenWords(language));
    const userSet = new Set(userVocab.map((w) => w.english.toLowerCase()));

    const displayWords: DisplayWord[] = userVocab
      .filter((w) => !hiddenWords.has(w.english.toLowerCase()))
      .map((w) => ({
        english: w.english,
        translation: w.translation,
        pronunciation: w.pronunciation,
        stage: w.stage,
        favorited: w.favorited,
        source: "user" as const,
      }));

    try {
      const json = await invoke<string>("get_bundled_words", { language });
      const bundled: Record<string, BundledWord> = JSON.parse(json);

      for (const [english, entry] of Object.entries(bundled)) {
        if (!userSet.has(english.toLowerCase()) && !hiddenWords.has(english.toLowerCase())) {
          displayWords.push({
            english,
            translation: entry.word,
            pronunciation: entry.pronunciation || "",
            native: entry.native,
            stage: "exposed",
            favorited: false,
            source: "system",
          });
        }
      }
    } catch {}

    setAllWords(displayWords);
  };

  useEffect(() => {
    loadWords();
    setExpandedWord(null);
    setWordDetails({});

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedWord) {
          setExpandedWord(null);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, language]);

  const handleToggleFavorite = async (e: React.MouseEvent, word: DisplayWord) => {
    e.stopPropagation();

    // If it's a system word not yet in user vocab, add it first
    if (word.source === "system") {
      await addWord({
        english: word.english,
        translation: word.translation,
        pronunciation: word.pronunciation,
        stage: "exposed",
      }, language);
    }

    await toggleFavorite(word.english, language);
    await loadWords();
  };

  const handleDeleteWord = async (e: React.MouseEvent, word: DisplayWord) => {
    e.stopPropagation();
    await deleteWord(word.english, language);
    setExpandedWord(null);
    await loadWords();
  };

  const handleWordClick = async (word: DisplayWord) => {
    const key = word.english;

    if (expandedWord === key) {
      setExpandedWord(null);
      return;
    }

    setExpandedWord(key);

    // Already fetched details for this word
    if (wordDetails[key]) return;

    // Try AI lookup first, fallback to offline
    setLoadingDetail(key);
    try {
      const settings = await getSettings();

      if (settings.apiKey) {
        const response = await invoke<string>("translate_text", {
          text: word.english,
          targetLanguage: language,
          apiKey: settings.apiKey,
        });
        const detail = parseResponse(response);
        setWordDetails((prev) => ({ ...prev, [key]: detail }));
      } else {
        // Offline: use what we already have
        setWordDetails((prev) => ({
          ...prev,
          [key]: {
            translation: word.translation,
            pronunciation: word.pronunciation,
            examples: [],
            mnemonic: "",
          },
        }));
      }
    } catch {
      setWordDetails((prev) => ({
        ...prev,
        [key]: {
          translation: word.translation,
          pronunciation: word.pronunciation,
          examples: [],
          mnemonic: "",
        },
      }));
    } finally {
      setLoadingDetail(null);
    }
  };

  const filtered = allWords
    .filter((w) => {
      if (filterMode === "user" && w.source !== "user") return false;
      if (filterMode === "system" && w.source !== "system") return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        w.english.toLowerCase().includes(q) ||
        w.translation.toLowerCase().includes(q) ||
        w.pronunciation.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.translation.localeCompare(b.translation));

  return (
    <div className="view-container">
      <div className="view-topbar">
        <button className="back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <span className="view-topbar-title">Vocabulary</span>
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

      <div className="vocabulary-toolbar">
        <div className="vocabulary-search-bar">
          <svg className="vocabulary-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="vocabulary-search-input"
            type="text"
            placeholder="Filter words..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="vocabulary-search-clear" onClick={() => setSearch("")}>
              &times;
            </button>
          )}
        </div>
        <select
          className="vocabulary-filter-dropdown"
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as FilterMode)}
        >
          <option value="all">Show all words</option>
          <option value="user">Show only words I added</option>
          <option value="system">Show only Siesta's words</option>
        </select>
      </div>

      <div className="vocabulary-count">
        {filtered.length} word{filtered.length !== 1 ? "s" : ""}
      </div>

      <div className="vocabulary-list">
        {filtered.length === 0 ? (
          <div className="vocabulary-empty">
            <p>No words found</p>
            <p className="vocabulary-empty-hint">
              {filterMode === "user"
                ? "Add words from the extension or Word of the Hour to see them here"
                : "Try a different search or filter"}
            </p>
          </div>
        ) : (
          filtered.map((word) => (
            <div key={`${word.source}-${word.english}`}>
              <div
                className={`vocabulary-item ${expandedWord === word.english ? "expanded" : ""}`}
                onClick={() => handleWordClick(word)}
              >
                <div className="vocabulary-item-main">
                  <span className="vocabulary-item-foreign">
                    {word.native && word.native !== word.translation
                      ? `${word.translation} / ${word.native}`
                      : word.translation}
                  </span>
                  <span className="vocabulary-item-english">{word.english}</span>
                </div>
                <div className="vocabulary-item-right">
                  <span className="vocabulary-item-pronunciation">{word.pronunciation}</span>
                  <div className="vocabulary-item-actions">
                    <span className={`vocabulary-stage ${word.stage}`}>
                      {word.stage}
                    </span>
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDeleteWord(e, word)}
                      title="Remove from vocabulary"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      className={`favorite-btn ${word.favorited ? "favorited" : ""}`}
                      onClick={(e) => handleToggleFavorite(e, word)}
                      title={word.favorited ? "Remove from favorites" : "Add to favorites"}
                    >
                      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                        <path
                          d="M9 15.5s-6.5-4.35-6.5-8.18A3.32 3.32 0 0 1 5.82 4 3.32 3.32 0 0 1 9 5.71 3.32 3.32 0 0 1 12.18 4a3.32 3.32 0 0 1 3.32 3.32c0 3.83-6.5 8.18-6.5 8.18Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill={word.favorited ? "currentColor" : "none"}
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {expandedWord === word.english && (
                <div className="vocabulary-detail">
                  {loadingDetail === word.english ? (
                    <div className="vocabulary-detail-loading">
                      <span className="lookup-spinner" />
                      <span>Loading details...</span>
                    </div>
                  ) : wordDetails[word.english] ? (
                    <>
                      <div className="vocabulary-detail-header">
                        <span className="vocabulary-detail-word">{wordDetails[word.english].translation || word.translation}</span>
                        {(wordDetails[word.english].pronunciation || word.pronunciation) && (
                          <span className="vocabulary-detail-pronunciation">
                            {wordDetails[word.english].pronunciation || word.pronunciation}
                          </span>
                        )}
                      </div>

                      {wordDetails[word.english].examples.length > 0 && (
                        <div className="vocabulary-detail-section">
                          <h4 className="vocabulary-detail-title">Examples</h4>
                          {wordDetails[word.english].examples.map((ex, i) => (
                            <p key={i} className="vocabulary-detail-example">{ex}</p>
                          ))}
                        </div>
                      )}

                      {wordDetails[word.english].mnemonic && (
                        <div className="vocabulary-detail-section">
                          <h4 className="vocabulary-detail-title">Remember it</h4>
                          <p className="vocabulary-detail-text">{wordDetails[word.english].mnemonic}</p>
                        </div>
                      )}

                      {wordDetails[word.english].dialect_notes && (
                        <div className="vocabulary-detail-section">
                          <h4 className="vocabulary-detail-title">Dialect Notes</h4>
                          <p className="vocabulary-detail-text">{wordDetails[word.english].dialect_notes}</p>
                        </div>
                      )}

                      {!wordDetails[word.english].examples.length &&
                       !wordDetails[word.english].mnemonic &&
                       !wordDetails[word.english].dialect_notes && (
                        <p className="vocabulary-detail-hint">
                          Add an API key in Settings for examples, mnemonics, and dialect notes.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Vocabulary;
