import { WordOfTheHour } from "../utils/storage";

interface LatestWordProps {
  word: WordOfTheHour | null;
  onSeeMore: () => void;
}

function LatestWord({ word, onSeeMore }: LatestWordProps) {
  if (!word) return null;

  return (
    <div className="latest-word">
      <div className="latest-word-header">
        <span className="latest-word-label">Word of the Hour</span>
        <button className="latest-word-more" onClick={onSeeMore}>
          see more
        </button>
      </div>
      <div className="latest-word-content">
        <span className="latest-word-translation">{word.translation}</span>
        <span className="latest-word-english">{word.english}</span>
        <span className="latest-word-pronunciation">{word.pronunciation}</span>
      </div>
    </div>
  );
}

export default LatestWord;
