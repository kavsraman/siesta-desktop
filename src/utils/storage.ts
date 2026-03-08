import { invoke } from "@tauri-apps/api/core";

export const LANGUAGES = ["Italian", "Spanish", "French", "Tamil", "German", "Hindi", "Mandarin", "Korean"];

export interface SiestaSettings {
  apiKey: string;
  language: string;
  notificationInterval: number;
  clipboardEnabled: boolean;
  darkMode: boolean;
}

export interface VocabWord {
  english: string;
  translation: string;
  pronunciation: string;
  stage: "exposed" | "familiar" | "acquired";
  seenCount: number;
  favorited: boolean;
  addedAt: string;
}

export interface WordOfTheHour {
  english: string;
  translation: string;
  pronunciation: string;
  deliveredAt: string;
}

export interface QuizResult {
  date: string;
  score: number;
  total: number;
}

export interface LanguageSummary {
  language: string;
  totalWords: number;
  exposed: number;
  familiar: number;
  acquired: number;
  skillLevel: number;
  latestWord: WordOfTheHour | null;
}

const SETTINGS_KEY = "siesta-settings";
const VOCAB_KEY = "siesta-vocabulary";
const WOTH_KEY = "siesta-woth-history";
const QUIZ_KEY = "siesta-quiz-results";
const MIGRATION_KEY = "siesta-data-migrated-v1";

function langKey(base: string, language: string): string {
  return `${base}:${language.toLowerCase()}`;
}

// ─── Migration ───

export async function migrateGlobalDataToPerLanguage(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  const settings = await getSettings();
  const lang = settings.language;

  const vocabRaw = localStorage.getItem(VOCAB_KEY);
  if (vocabRaw) {
    localStorage.setItem(langKey(VOCAB_KEY, lang), vocabRaw);
    localStorage.removeItem(VOCAB_KEY);
  }

  const wothRaw = localStorage.getItem(WOTH_KEY);
  if (wothRaw) {
    localStorage.setItem(langKey(WOTH_KEY, lang), wothRaw);
    localStorage.removeItem(WOTH_KEY);
  }

  const quizRaw = localStorage.getItem(QUIZ_KEY);
  if (quizRaw) {
    localStorage.setItem(langKey(QUIZ_KEY, lang), quizRaw);
    localStorage.removeItem(QUIZ_KEY);
  }

  localStorage.setItem(MIGRATION_KEY, "true");
}

// ─── Persisted config (~/.siesta/config.json) ───

async function loadPersistedApiKey(): Promise<string> {
  try {
    const json = await invoke<string>("load_persisted_config");
    const parsed = JSON.parse(json);
    return parsed.apiKey || "";
  } catch {
    return "";
  }
}

async function savePersistedApiKey(apiKey: string): Promise<void> {
  try {
    await invoke("save_persisted_config", {
      json: JSON.stringify({ apiKey }),
    });
  } catch {}
}

// ─── Settings (global) ───

export async function getSettings(): Promise<SiestaSettings> {
  const defaults: SiestaSettings = {
    apiKey: "",
    language: "Italian",
    notificationInterval: 60,
    clipboardEnabled: false,
    darkMode: false,
  };

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      Object.assign(defaults, parsed, { darkMode: parsed.darkMode ?? false });
    }
  } catch {}

  // Always prefer the API key from the persisted config file
  const persistedKey = await loadPersistedApiKey();
  if (persistedKey) {
    defaults.apiKey = persistedKey;
  }

  return defaults;
}

export async function saveSettings(settings: SiestaSettings): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  // Persist the API key to ~/.siesta/config.json so it survives restarts
  if (settings.apiKey) {
    await savePersistedApiKey(settings.apiKey);
  }
}

// ─── Shared vocabulary (~/.siesta/vocabulary.json) ───

interface SharedWord {
  translation: string;
  pronunciation: string;
  native: string;
  addedAt: number;
  stage: string;
}

async function loadSharedVocabulary(language: string): Promise<Record<string, SharedWord>> {
  try {
    const json = await invoke<string>("load_shared_vocabulary", { language });
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function mapSharedStage(stage: string): "exposed" | "familiar" | "acquired" {
  if (stage === "acquired" || stage === "known") return "acquired";
  if (stage === "familiar") return "familiar";
  return "exposed"; // "learning", "exposed", or anything else
}

// ─── Vocabulary (per-language) ───

export async function getVocabulary(language: string): Promise<VocabWord[]> {
  // Load local vocabulary
  let localWords: VocabWord[] = [];
  try {
    const stored = localStorage.getItem(langKey(VOCAB_KEY, language));
    if (stored) {
      localWords = JSON.parse(stored);
      localWords = localWords.map((w) => ({
        ...w,
        favorited: w.favorited ?? false,
        addedAt: w.addedAt ?? new Date().toISOString(),
      }));
    }
  } catch {}

  // Merge with shared vocabulary from Chrome extension (~/.siesta/vocabulary.json)
  // Keys in shared vocab are foreign words; translation = English meaning
  const shared = await loadSharedVocabulary(language);

  // Build lookup maps — all keys lowercase for case-insensitive matching
  const localByEnglish = new Map(localWords.map((w) => [w.english.toLowerCase(), w]));
  const localByTranslation = new Map(
    localWords
      .filter((w) => w.translation)
      .map((w) => [w.translation.toLowerCase(), w])
  );

  for (const [foreignWord, entry] of Object.entries(shared)) {
    const englishWord = (entry.translation || foreignWord).toLowerCase().trim();
    const nativeWord = (entry.native || foreignWord).toLowerCase().trim();

    // Check by english key, by foreign word in translations, and by foreign word as english key
    const existing =
      localByEnglish.get(englishWord) ||
      localByTranslation.get(nativeWord) ||
      localByTranslation.get(foreignWord.toLowerCase().trim()) ||
      localByEnglish.get(foreignWord.toLowerCase().trim());

    if (existing) {
      if (!existing.translation && (entry.native || foreignWord)) existing.translation = entry.native || foreignWord;
      if (!existing.pronunciation && entry.pronunciation) existing.pronunciation = entry.pronunciation;
    } else {
      const word: VocabWord = {
        english: englishWord,
        translation: entry.native || foreignWord,
        pronunciation: entry.pronunciation || "",
        stage: mapSharedStage(entry.stage),
        seenCount: 1,
        favorited: false,
        addedAt: entry.addedAt
          ? new Date(entry.addedAt).toISOString()
          : new Date().toISOString(),
      };
      localByEnglish.set(englishWord, word);
      localByTranslation.set(nativeWord, word);
    }
  }

  // Final dedup: by english key AND by translation, keep highest seenCount / most recent
  const deduped = new Map<string, VocabWord>();
  const seenTranslations = new Set<string>();
  for (const w of localByEnglish.values()) {
    const engKey = w.english.toLowerCase();
    const transKey = w.translation.toLowerCase();

    // Skip if we already have this translation under a different english key
    if (seenTranslations.has(transKey)) {
      const existingByTrans = Array.from(deduped.values()).find(
        (v) => v.translation.toLowerCase() === transKey
      );
      if (existingByTrans) {
        if (w.seenCount > existingByTrans.seenCount || w.addedAt > existingByTrans.addedAt) {
          deduped.delete(existingByTrans.english.toLowerCase());
          deduped.set(engKey, w);
        }
        continue;
      }
    }

    const existing = deduped.get(engKey);
    if (!existing || w.seenCount > existing.seenCount || w.addedAt > existing.addedAt) {
      deduped.set(engKey, w);
    }
    seenTranslations.add(transKey);
  }

  return Array.from(deduped.values());
}

export async function saveVocabulary(words: VocabWord[], language: string): Promise<void> {
  localStorage.setItem(langKey(VOCAB_KEY, language), JSON.stringify(words));
}

export async function addWord(
  word: Omit<VocabWord, "seenCount" | "favorited" | "addedAt">,
  language: string
): Promise<void> {
  const vocab = await getVocabulary(language);
  const existing = vocab.find((w) => w.english === word.english);
  if (existing) {
    existing.seenCount++;
    if (existing.seenCount >= 16) existing.stage = "acquired";
    else if (existing.seenCount >= 6) existing.stage = "familiar";
  } else {
    vocab.push({ ...word, seenCount: 1, favorited: false, addedAt: new Date().toISOString() });
  }
  await saveVocabulary(vocab, language);
}

export async function updateWordStage(
  english: string,
  stage: "exposed" | "familiar" | "acquired",
  language: string
): Promise<void> {
  const vocab = await getVocabulary(language);
  const word = vocab.find((w) => w.english === english);
  if (word) {
    word.stage = stage;
    await saveVocabulary(vocab, language);
  }
}

export async function deleteWord(english: string, language: string): Promise<void> {
  // Remove from local storage
  let localWords: VocabWord[] = [];
  try {
    const stored = localStorage.getItem(langKey(VOCAB_KEY, language));
    if (stored) localWords = JSON.parse(stored);
  } catch {}
  localWords = localWords.filter((w) => w.english.toLowerCase() !== english.toLowerCase());
  localStorage.setItem(langKey(VOCAB_KEY, language), JSON.stringify(localWords));

  // Also add to hidden words so bundled/system words stay hidden
  await hideWord(english, language);
}

const HIDDEN_KEY = "siesta-hidden-words";

export async function hideWord(english: string, language: string): Promise<void> {
  const hidden = getHiddenWords(language);
  const key = english.toLowerCase();
  if (!hidden.includes(key)) {
    hidden.push(key);
    localStorage.setItem(langKey(HIDDEN_KEY, language), JSON.stringify(hidden));
  }
}

export function getHiddenWords(language: string): string[] {
  try {
    const stored = localStorage.getItem(langKey(HIDDEN_KEY, language));
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export async function toggleFavorite(english: string, language: string): Promise<boolean> {
  const vocab = await getVocabulary(language);
  const word = vocab.find((w) => w.english === english);
  if (word) {
    word.favorited = !word.favorited;
    await saveVocabulary(vocab, language);
    return word.favorited;
  }
  return false;
}

export async function getFavorites(language: string): Promise<VocabWord[]> {
  const vocab = await getVocabulary(language);
  return vocab.filter((w) => w.favorited);
}

// ─── Word of the Hour (per-language) ───

export async function getWordHistory(language: string): Promise<WordOfTheHour[]> {
  try {
    const stored = localStorage.getItem(langKey(WOTH_KEY, language));
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export async function addWordOfTheHour(word: WordOfTheHour, language: string): Promise<void> {
  const history = await getWordHistory(language);
  history.unshift(word);
  localStorage.setItem(langKey(WOTH_KEY, language), JSON.stringify(history));
}

// ─── Quiz Results (per-language) ───

export async function getQuizResults(language: string): Promise<QuizResult[]> {
  try {
    const stored = localStorage.getItem(langKey(QUIZ_KEY, language));
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export async function saveQuizResult(result: QuizResult, language: string): Promise<void> {
  const results = await getQuizResults(language);
  results.push(result);
  localStorage.setItem(langKey(QUIZ_KEY, language), JSON.stringify(results));
}

// ─── Skill Level (per-language) ───

export async function getSkillLevel(language: string): Promise<number> {
  const vocab = await getVocabulary(language);
  const quizResults = await getQuizResults(language);

  if (vocab.length === 0 && quizResults.length === 0) return 0;

  const wordScore = Math.min(vocab.length / 100, 1) * 2;

  const acquiredPct = vocab.length > 0
    ? vocab.filter((w) => w.stage === "acquired").length / vocab.length
    : 0;
  const acquiredScore = acquiredPct * 1.5;

  const recentQuizzes = quizResults.slice(-10);
  const quizAvg = recentQuizzes.length > 0
    ? recentQuizzes.reduce((sum, q) => sum + q.score / q.total, 0) / recentQuizzes.length
    : 0;
  const quizScore = quizAvg * 1.5;

  return Math.min(wordScore + acquiredScore + quizScore, 5);
}

// ─── Active Languages ───

export function getActiveLanguages(): string[] {
  const prefix = `${VOCAB_KEY}:`;
  const languages: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const lang = key.slice(prefix.length);
      languages.push(lang.charAt(0).toUpperCase() + lang.slice(1));
    }
  }
  return languages;
}

export async function getLanguageSummary(language: string): Promise<LanguageSummary> {
  const vocab = await getVocabulary(language);
  const skillLevel = await getSkillLevel(language);
  const history = await getWordHistory(language);

  return {
    language,
    totalWords: vocab.length,
    exposed: vocab.filter((w) => w.stage === "exposed").length,
    familiar: vocab.filter((w) => w.stage === "familiar").length,
    acquired: vocab.filter((w) => w.stage === "acquired").length,
    skillLevel,
    latestWord: history.length > 0 ? history[0] : null,
  };
}

export async function getAllLanguageSummaries(): Promise<LanguageSummary[]> {
  const langs = getActiveLanguages();
  return Promise.all(langs.map(getLanguageSummary));
}
