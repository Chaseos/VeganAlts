import { Wordmark } from "./icons/wordmark";
import { t } from "../i18n";

const steps = () => [
  { title: t("comingSoon.step1Title"), body: t("comingSoon.step1Body") },
  { title: t("comingSoon.step2Title"), body: t("comingSoon.step2Body") },
  { title: t("comingSoon.step3Title"), body: t("comingSoon.step3Body") },
];

// Production's pre-launch page: no catalog, no aisle bar.
export function ComingSoon() {
  return (
    <div className="va-site">
      <header className="va-header va-kale">
        <div className="va-header__row">
          <a
            className="va-header__brand"
            href="/"
            aria-label={t("chrome.home")}
          >
            <Wordmark size="header" />
          </a>
          <span className="va-header__tools va-coming-soon__status">
            {t("comingSoon.status")}
          </span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="va-main">
        <section
          className="va-kale va-coming-soon__hero"
          aria-labelledby="hero-title"
        >
          <div className="va-container">
            <p className="va-coming-soon__eyebrow">{t("comingSoon.eyebrow")}</p>
            <h1 id="hero-title" className="va-display-xl">
              {t("comingSoon.title")}
            </h1>
            <p className="va-body-l va-coming-soon__lead">
              {t("comingSoon.lead")}
            </p>
            <ul
              className="va-coming-soon__foods"
              aria-label={t("comingSoon.startingFoods")}
            >
              {[
                t("comingSoon.burgers"),
                t("comingSoon.milk"),
                t("comingSoon.cheese"),
                t("comingSoon.butter"),
                t("comingSoon.eggs"),
              ].map((food) => (
                <li key={food}>{food}</li>
              ))}
            </ul>
            <p className="va-coming-soon__note">
              {t("comingSoon.noteLead")}
              {t("text.gap")}
              <strong>{t("comingSoon.noteStrong")}</strong>
            </p>
          </div>
        </section>
        <section
          className="va-container va-coming-soon__steps"
          aria-label={t("comingSoon.different")}
        >
          {steps().map((step, index) => (
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
          <p>{t("comingSoon.footer")}</p>
        </div>
      </footer>
    </div>
  );
}
