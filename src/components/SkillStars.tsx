interface SkillStarsProps {
  level: number; // 0–5, can be fractional
}

function SkillStars({ level }: SkillStarsProps) {
  const stars = [];
  for (let i = 0; i < 5; i++) {
    const fill = Math.min(Math.max(level - i, 0), 1);
    stars.push(
      <span key={i} className="skill-star">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <defs>
            <clipPath id={`star-clip-${i}`}>
              <rect x="0" y="0" width={`${fill * 100}%`} height="100%" />
            </clipPath>
          </defs>
          <path
            d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.52l-3.52 1.83.67-3.93L2.3 5.64l3.94-.57L8 1.5z"
            stroke="var(--accent)"
            strokeWidth="1"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.52l-3.52 1.83.67-3.93L2.3 5.64l3.94-.57L8 1.5z"
            fill="var(--accent)"
            clipPath={`url(#star-clip-${i})`}
          />
        </svg>
      </span>
    );
  }

  return (
    <div className="skill-stars">
      <span className="skill-stars-label">Skill Level</span>
      <div className="skill-stars-row">
        {stars}
        <span className="skill-stars-value">{level.toFixed(1)}</span>
      </div>
    </div>
  );
}

export default SkillStars;
