import "./LoadingCat.css";

interface LoadingCatProps {
  message: string;
  subtitle?: string;
  showCat?: boolean;
}

function LoadingCat({ message, subtitle, showCat = false }: LoadingCatProps) {
  return (
    <div className="loading-card">
      <p>{message}</p>
      {subtitle && <small>{subtitle}</small>}

      {showCat && (
        <div className="cat-scene">
          <svg className="yarn-ball" width="30" height="30" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="#F2AEBC" stroke="#E87B8B" strokeWidth="1.5" />
            <path d="M4 16 Q16 4 28 16" stroke="#E87B8B" strokeWidth="1.2" fill="none" />
            <path d="M4 16 Q16 28 28 16" stroke="#E87B8B" strokeWidth="1.2" fill="none" />
            <path d="M16 2 Q28 16 16 30" stroke="#E87B8B" strokeWidth="1.2" fill="none" />
          </svg>
          <svg className="cat-body" width="52" height="56" viewBox="0 0 56 60">
            <ellipse cx="28" cy="42" rx="15" ry="13" fill="#2A1F28" />
            <circle cx="28" cy="22" r="13" fill="#2A1F28" />
            <polygon points="17,12 13,2 22,9" fill="#2A1F28" />
            <polygon points="39,12 43,2 34,9" fill="#2A1F28" />
            <circle cx="24" cy="21" r="2.5" fill="white" />
            <circle cx="32" cy="21" r="2.5" fill="white" />
            <circle cx="24.8" cy="21.5" r="1.2" fill="#2A1F28" />
            <circle cx="32.8" cy="21.5" r="1.2" fill="#2A1F28" />
            <ellipse cx="28" cy="26" rx="2" ry="1.2" fill="#F2AEBC" />
            <path d="M22 28 Q28 31 34 28" stroke="#F2AEBC" strokeWidth="1" fill="none" />
          </svg>
        </div>
      )}

      <div className="progress-wrap">
        <div className="progress-fill" />
      </div>
    </div>
  );
}

export default LoadingCat;
