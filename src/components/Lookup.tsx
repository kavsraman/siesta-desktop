import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSettings, addWord, toggleFavorite, getVocabulary } from "../utils/storage";

interface TranslationResult {
  translation: string;
  pronunciation: string;
  examples: string[];
  mnemonic: string;
  dialect_notes?: string;
}

interface LookupProps {
  onBack: () => void;
}

function parseResponse(raw: string): TranslationResult {
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

  return {
    translation: text,
    pronunciation: "",
    examples: [],
    mnemonic: "",
  };
}

function Lookup({ onBack }: LookupProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [lang, setLang] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    getSettings().then((s) => setLang(s.language));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const checkFavorited = async (english: string, language: string) => {
    const vocab = await getVocabulary(language);
    const word = vocab.find((w) => w.english === english.toLowerCase());
    setFavorited(word?.favorited ?? false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setFavorited(false);

    try {
      const settings = await getSettings();
      const language = settings.language;
      setLang(language);

      if (!settings.apiKey) {
        setError("Add your API key in Settings first");
        setLoading(false);
        return;
      }

      const response = await invoke<string>("translate_text", {
        text: query.trim(),
        targetLanguage: language,
        apiKey: settings.apiKey,
      });

      const parsed = parseResponse(response);
      setResult(parsed);

      await addWord({
        english: query.trim().toLowerCase(),
        translation: parsed.translation,
        pronunciation: parsed.pronunciation,
        stage: "exposed",
      }, language);

      await checkFavorited(query.trim().toLowerCase(), language);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!result || !lang) return;
    const newState = await toggleFavorite(query.trim().toLowerCase(), lang);
    setFavorited(newState);
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
        <span className="view-topbar-title">Quick Lookup</span>
        <span className="view-topbar-spacer" />
      </div>

      <form onSubmit={handleSubmit} className="lookup-form">
        <div className="lookup-input-row">
          <svg className="lookup-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.8" />
            <line x1="12" y1="12" x2="15.5" y2="15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="lookup-input"
            placeholder="Type a word or phrase..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {loading && <span className="lookup-spinner" />}
        </div>
      </form>

      {error && <div className="lookup-error">{error}</div>}

      {result && (
        <div className="lookup-result">
          <div className="result-translation">
            <div className="result-translation-row">
              <div>
                <span className="result-word">{result.translation}</span>
                {result.pronunciation && (
                  <span className="result-pronunciation">{result.pronunciation}</span>
                )}
              </div>
              <button
                className={`favorite-btn ${favorited ? "favorited" : ""}`}
                onClick={handleFavorite}
                title={favorited ? "Remove from favorites" : "Add to favorites"}
              >
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 15.5s-6.5-4.35-6.5-8.18A3.32 3.32 0 0 1 5.82 4 3.32 3.32 0 0 1 9 5.71 3.32 3.32 0 0 1 12.18 4a3.32 3.32 0 0 1 3.32 3.32c0 3.83-6.5 8.18-6.5 8.18Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill={favorited ? "currentColor" : "none"}
                  />
                </svg>
              </button>
            </div>
          </div>

          {result.examples.length > 0 && (
            <div className="result-section">
              <h4 className="result-section-title">Examples</h4>
              {result.examples.map((ex, i) => (
                <p key={i} className="result-example">{ex}</p>
              ))}
            </div>
          )}

          {result.mnemonic && (
            <div className="result-section">
              <h4 className="result-section-title">Remember it</h4>
              <p className="result-mnemonic">{result.mnemonic}</p>
            </div>
          )}

          {result.dialect_notes && (
            <div className="result-section">
              <h4 className="result-section-title">Dialect Notes</h4>
              <p className="result-dialect">{result.dialect_notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="lookup-footer">
        <span className="lookup-hint">Esc to go back</span>
      </div>
    </div>
  );
}

export default Lookup;
