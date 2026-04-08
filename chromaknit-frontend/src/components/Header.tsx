import BuilderNotes from "./BuilderNotes";

const DOTS = ["#E87B8B", "#C9B8D8", "#A8C8DC", "#9BB89A", "#F0A882", "#D4A843", "#F2AEBC"];

interface HeaderProps {
  onStart: () => void;
}

function Header({ onStart }: HeaderProps) {
  return (
    <section className="header">
      <div className="header-content">
        <div className="headline-block">
          <span className="eyebrow">colour extraction &middot; computer vision</span>
          <h1 className="header-h1">
            see it in colour<em>before you cast on</em>
          </h1>
          <p className="header-tagline">no more guessing at the yarn shop</p>
          <p className="header-sub">
            Upload your yarn. See your garment recoloured instantly. Buy what you love.
          </p>
          <div className="colour-dots">
            {DOTS.map((c) => (
              <div key={c} className="dot" style={{ background: c }} />
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn-primary" onClick={onStart}>
              &#x2726; try it now
            </button>
          </div>
          <BuilderNotes />
        </div>
      </div>
    </section>
  );
}

export default Header;
