import { useState, useEffect } from "react";
import { getSettings, saveSettings, LANGUAGES, type SiestaSettings } from "../utils/storage";

const NOTIFICATION_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
];

interface SettingsProps {
  onBack: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

function Settings({ onBack, language, onLanguageChange }: SettingsProps) {
  const [settings, setSettings] = useState<SiestaSettings>({
    apiKey: "",
    language: "Italian",
    notificationInterval: 60,
    clipboardEnabled: false,
    darkMode: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDarkModeToggle = () => {
    const newSettings = { ...settings, darkMode: !settings.darkMode };
    setSettings(newSettings);
    document.documentElement.setAttribute("data-theme", newSettings.darkMode ? "dark" : "light");
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-btn" onClick={onBack}>
          &larr; Back
        </button>
        <h2 className="settings-title">Settings</h2>
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

      <div className="settings-section">
        <label className="settings-label">Target Language</label>
        <select
          className="settings-select"
          value={settings.language}
          onChange={(e) =>
            setSettings({ ...settings, language: e.target.value })
          }
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <label className="settings-label">Anthropic API Key</label>
        <input
          type="password"
          className="settings-input"
          placeholder="sk-ant-..."
          value={settings.apiKey}
          onChange={(e) =>
            setSettings({ ...settings, apiKey: e.target.value })
          }
        />
        <p className="settings-hint">
          Your key stays on your device. Never sent anywhere except Anthropic's
          API.
        </p>
      </div>

      <div className="settings-section">
        <label className="settings-label">Word-of-the-Hour</label>
        <div className="notification-options">
          {NOTIFICATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`notif-btn ${
                settings.notificationInterval === opt.value ? "active" : ""
              }`}
              onClick={() =>
                setSettings({ ...settings, notificationInterval: opt.value })
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Appearance</label>
        <div className="notification-options">
          <button
            className={`notif-btn ${!settings.darkMode ? "active" : ""}`}
            onClick={() => {
              if (settings.darkMode) handleDarkModeToggle();
            }}
          >
            Light
          </button>
          <button
            className={`notif-btn ${settings.darkMode ? "active" : ""}`}
            onClick={() => {
              if (!settings.darkMode) handleDarkModeToggle();
            }}
          >
            Dark
          </button>
        </div>
      </div>

      <button className="save-btn" onClick={handleSave}>
        {saved ? "Saved ✓" : "Save Settings"}
      </button>
    </div>
  );
}

export default Settings;
