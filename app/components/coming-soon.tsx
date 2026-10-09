import { Wordmark } from "./icons/wordmark";

const STEPS = [
  {
    title: "Find your match",
    body: "Start with what you want to replace. Discover alternatives available in your country.",
  },
  {
    title: "Real people. Real experience.",
    body: "Ranked by how closely they match the original, with more feedback making the picture clearer.",
  },
  {
    title: "Independent by design",
    body: "Community experience shapes the rankings. Brands can never buy their way to the top.",
  },
];

// Production's pre-launch page: no catalog, no aisle bar.
export function ComingSoon() {
  return (
    <div className="va-site">
      <header className="va-header va-kale">
        <div className="va-header__row">
          <a className="va-header__brand" href="/" aria-label="VeganAlts home">
            <Wordmark size="header" />
          </a>
          <span className="va-header__tools va-coming-soon__status">
            Coming soon
          </span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="va-main">
        <section className="va-kale va-coming-soon__hero" aria-labelledby="hero-title">
          <div className="va-container">
            <p className="va-coming-soon__eyebrow">Good food. Closer matches.</p>
            <h1 id="hero-title" className="va-display-xl">
              Find the closest vegan swap.
            </h1>
            <p className="va-body-l va-coming-soon__lead">
              The burger that gets it right. The cheese that actually melts.
              Find alternatives to the foods you love, ranked by people who’ve
              tried them.
            </p>
            <ul className="va-coming-soon__foods" aria-label="Foods we’re starting with">
              {["Burgers", "Milk", "Cheese", "Butter", "Eggs"].map((food) => (
                <li key={food}>{food}</li>
              ))}
            </ul>
            <p className="va-coming-soon__note">
              A better way to find your next favorite.{" "}
              <strong>We’re getting things ready.</strong>
            </p>
          </div>
        </section>
        <section
          className="va-container va-coming-soon__steps"
          aria-label="What makes VeganAlts different"
        >
          {STEPS.map((step, index) => (
            <article key={step.title} className="va-card">
              <span className="va-step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="va-heading-s">{step.title}</h2>
              <p className="va-muted">{step.body}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="va-footer va-kale">
        <div className="va-footer__inner">
          <p>Community-ranked vegan alternatives. Made for your next good swap.</p>
        </div>
      </footer>
    </div>
  );
}
