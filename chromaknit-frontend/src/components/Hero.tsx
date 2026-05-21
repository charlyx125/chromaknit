import "./Hero.css";

interface HeroProps {
  onStart: () => void;
}

// Hero matches the sample palette in the mockup. Hard-coded because this
// is the above-the-fold marketing example, not user data.
const HERO_PALETTE_SWATCHES = [
  "#505f3e",
  "#465534",
  "#5b6a49",
  "#677655",
  "#3b4a29",
  "#748362",
  "#829170",
  "#2b3a19",
  "#95a483",
  "#b2c1a0",
];

function Hero({ onStart }: HeroProps) {
  return (
    <section className="hero" aria-label="ChromaKnit introduction">
      <div className="hero-container">
        <div className="hero-grid">
          <div className="hero-text">
            <div className="hero-meta caps">
              For knitters, crocheters &amp; yarn lovers
            </div>
            <h1 className="hero-title">CHROMAKNIT</h1>
            <p className="hero-tagline">Try the yarn before you cast on.</p>
            <button type="button" className="hero-cta" onClick={onStart}>
              Try it now
            </button>
            <div className="hero-fineprint">
              Free forever. No sign up. Made with love for makers.
            </div>
          </div>

          <div className="hero-visual">
            <div
              className="hero-demo"
              aria-label="Before and after recolouring example"
            >
              <figure className="demo-photo is-before">
                <img
                  src="/samples/garment-cardigan.jpg"
                  alt="A cardigan, before recolouring"
                />
                <figcaption className="demo-caption">Before</figcaption>
              </figure>
              <div className="demo-bridge" aria-hidden="true">
                <div className="demo-bridge-line" />
                <div className="demo-bridge-stamp">
                  <span>&#x2726;</span>
                </div>
                <div className="demo-bridge-label">Recoloured</div>
                <div className="demo-bridge-line" />
              </div>
              <figure className="demo-photo">
                <img
                  src="/samples/mohair-green-cardigan.png"
                  alt="The same cardigan, recoloured in mohair green"
                />
                <figcaption className="demo-caption">After</figcaption>
              </figure>
            </div>

            <div
              className="hero-palette-card"
              aria-label="The yarn that supplied the palette"
            >
              <div className="hero-palette-thumb">
                <img src="/samples/yarn-light-green.jpg" alt="" />
              </div>
              <div className="hero-palette-text">
                <span className="hero-palette-label">Recoloured from</span>
                <span className="hero-palette-name">Mohair green</span>
              </div>
              <div className="hero-palette-swatches" aria-hidden="true">
                {HERO_PALETTE_SWATCHES.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
