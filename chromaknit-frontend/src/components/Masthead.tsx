import "./Masthead.css";

interface MastheadProps {
  onStart: () => void;
  onHome: () => void;
}

function Masthead({ onStart, onHome }: MastheadProps) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="masthead-brand">
          <button
            type="button"
            className="masthead-mark"
            onClick={onHome}
            aria-label="Chromaknit — return to landing"
          >
            Chromaknit
          </button>
        </div>
        <nav className="masthead-nav" aria-label="Primary">
          <a
            className="masthead-link"
            href="https://github.com/charlyx125/chromaknit"
            target="_blank"
            rel="noopener noreferrer"
          >
            Github
          </a>
          <button type="button" className="masthead-cta" onClick={onStart}>
            Try it now
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Masthead;
