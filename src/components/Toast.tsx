import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSettings } from "../utils/storage";

interface ToastProps {
  text: string;
  onDismiss: () => void;
}

interface QuickTranslation {
  translation: string;
  pronunciation: string;
}

function Toast({ text, onDismiss }: ToastProps) {
  const [translation, setTranslation] = useState<QuickTranslation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dismissed = false;

    const translate = async () => {
      try {
        const settings = await getSettings();
        if (!settings.apiKey) {
          setTranslation({ translation: "Set API key in settings", pronunciation: "" });
          setLoading(false);
          return;
        }

        const response = await invoke<string>("quick_translate", {
          text,
          targetLanguage: settings.language,
          apiKey: settings.apiKey,
        });

        if (!dismissed) {
          try {
            setTranslation(JSON.parse(response));
          } catch {
            setTranslation({ translation: response, pronunciation: "" });
          }
          setLoading(false);
        }
      } catch {
        if (!dismissed) {
          setTranslation({ translation: "Translation failed", pronunciation: "" });
          setLoading(false);
        }
      }
    };

    translate();

    const timer = setTimeout(() => {
      if (!dismissed) onDismiss();
    }, 4000);

    return () => {
      dismissed = true;
      clearTimeout(timer);
    };
  }, [text, onDismiss]);

  return (
    <div className="toast" onClick={onDismiss}>
      <div className="toast-header">
        <span className="toast-label">Clipboard Translation</span>
        <span className="toast-dismiss">×</span>
      </div>
      <div className="toast-original">{text.length > 60 ? text.slice(0, 60) + "…" : text}</div>
      {loading ? (
        <div className="toast-loading">Translating...</div>
      ) : translation ? (
        <div className="toast-translation">
          <span className="toast-word">{translation.translation}</span>
          {translation.pronunciation && (
            <span className="toast-pronunciation">{translation.pronunciation}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default Toast;
