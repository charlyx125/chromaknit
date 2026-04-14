import "./Header.css";

interface HeaderProps {
  onStart: () => void;
}

function Header({ onStart }: HeaderProps) {
  return (
    <section className="header" aria-label="ChromaKnit introduction">
      {/* ---- Lace card with all content ---- */}
      <div className="lace-card">
        <h1 className="wave-title">ChromaKnit</h1>
        <p className="wave-tagline">See it in colour, before you cast on</p>
        <p className="wave-detail">
          Upload your yarn. See your garment recoloured instantly.
        </p>
        <button className="wave-cta" onClick={onStart}>
          try it now
          <svg className="cta-arrow" width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 9 L12 9 M9 5 L13 9 L9 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}

export default Header;
