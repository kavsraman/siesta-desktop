import { useState } from "react";
import { LanguageSummary } from "../utils/storage";

interface ActiveLanguagesProps {
  summaries: LanguageSummary[];
  currentLanguage: string;
  onSwitchLanguage: (lang: string) => void;
}

function ActiveLanguages({ summaries, currentLanguage, onSwitchLanguage }: ActiveLanguagesProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (summaries.length <= 1) return null;

  const toggle = (lang: string) => {
    setExpanded(expanded === lang ? null : lang);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="active-languages">
      <div className="active-languages-header">
        <span className="active-languages-title">Active Languages</span>
        <span className="active-languages-count">{summaries.length}</span>
      </div>
      {summaries.map((s) => {
        const isCurrent = s.language.toLowerCase() === currentLanguage.toLowerCase();
        const isExpanded = expanded === s.language;
        const pctAcquired = s.totalWords > 0 ? Math.round((s.acquired / s.totalWords) * 100) : 0;

        return (
          <div
            key={s.language}
            className={`lang-card ${isCurrent ? "lang-card-current" : ""} ${isExpanded ? "lang-card-expanded" : ""}`}
          >
            <button className="lang-card-header" onClick={() => toggle(s.language)}>
              <div className="lang-card-left">
                <span className="lang-card-name">{s.language}</span>
                {isCurrent && <span className="lang-card-badge">current</span>}
              </div>
              <div className="lang-card-right">
                <span className="lang-card-words">{s.totalWords} words</span>
                <svg
                  className={`lang-card-chevron ${isExpanded ? "open" : ""}`}
                  width="14" height="14" viewBox="0 0 14 14" fill="none"
                >
                  <path d="M4 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            <div className="lang-card-mini-bar">
              <div className="lang-card-mini-track">
                {s.totalWords > 0 && (
                  <>
                    <div className="lang-card-mini-fill exposed" style={{ width: `${(s.exposed / s.totalWords) * 100}%` }} />
                    <div className="lang-card-mini-fill familiar" style={{ width: `${(s.familiar / s.totalWords) * 100}%` }} />
                    <div className="lang-card-mini-fill acquired" style={{ width: `${(s.acquired / s.totalWords) * 100}%` }} />
                  </>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="lang-card-details">
                <div className="lang-card-stats">
                  <div className="lang-card-stat">
                    <span className="lang-card-stat-value">{pctAcquired}%</span>
                    <span className="lang-card-stat-label">acquired</span>
                  </div>
                  <div className="lang-card-stat">
                    <span className="lang-card-stat-value">{s.skillLevel.toFixed(1)}</span>
                    <span className="lang-card-stat-label">skill</span>
                  </div>
                  <div className="lang-card-stat">
                    <span className="lang-card-stat-value">{s.totalWords}</span>
                    <span className="lang-card-stat-label">words</span>
                  </div>
                </div>

                {s.latestWord && (
                  <div className="lang-card-latest">
                    <span className="lang-card-latest-label">Latest word</span>
                    <span className="lang-card-latest-word">
                      {s.latestWord.translation} — {s.latestWord.english}
                    </span>
                    <span className="lang-card-latest-time">{formatTime(s.latestWord.deliveredAt)}</span>
                  </div>
                )}

                {!isCurrent && (
                  <button
                    className="lang-card-switch"
                    onClick={(e) => { e.stopPropagation(); onSwitchLanguage(s.language); }}
                  >
                    Switch to {s.language}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ActiveLanguages;
