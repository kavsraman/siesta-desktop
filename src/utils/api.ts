import { invoke } from "@tauri-apps/api/core";

export interface TranslationResult {
  translation: string;
  pronunciation: string;
  examples: string[];
  mnemonic: string;
  dialect_notes?: string;
}

export async function translateWord(
  text: string,
  targetLanguage: string,
  apiKey: string
): Promise<TranslationResult> {
  const response = await invoke<string>("translate_text", {
    text,
    targetLanguage,
    apiKey,
  });

  try {
    return JSON.parse(response);
  } catch {
    return {
      translation: response,
      pronunciation: "",
      examples: [],
      mnemonic: "",
    };
  }
}

export async function quickTranslate(
  text: string,
  targetLanguage: string,
  apiKey: string
): Promise<{ translation: string; pronunciation: string }> {
  const response = await invoke<string>("quick_translate", {
    text,
    targetLanguage,
    apiKey,
  });

  try {
    return JSON.parse(response);
  } catch {
    return { translation: response, pronunciation: "" };
  }
}
