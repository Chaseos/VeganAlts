import { env } from "cloudflare:workers";
import type { Route } from "./+types/home";
import { PUBLIC_LANDING_CACHE_CONTROL } from "@server/shared/http/response-policy";

const description =
  "Find the closest vegan alternative. Community-ranked alternatives to the foods you already love. Coming soon.";

export function loader() {
  return { staging: env.APP_ENV !== "production" };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: "VeganAlts — Find the closest vegan alternative" },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: "https://veganalts.com/" },
    { property: "og:title", content: "Find the closest vegan alternative." },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://veganalts.com/" },
    { property: "og:image", content: "https://veganalts.com/social.png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    ...(loaderData?.staging
      ? [{ name: "robots", content: "noindex, nofollow" }]
      : []),
  ];
}

export function headers() {
  return { "Cache-Control": PUBLIC_LANDING_CACHE_CONTROL };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="landing">
      {loaderData.staging && (
        <div className="environment-banner">
          Development preview · VeganAlts is not open yet
        </div>
      )}
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="VeganAlts home">
          VeganAlts<span aria-hidden="true">.</span>
        </a>
        <span className="launch-status">
          <span aria-hidden="true" />
          Coming soon
        </span>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Good food. Closer matches.</p>
          <h1 id="hero-title">
            Find the closest
            <br />
            <em>vegan alternative.</em>
          </h1>
          <p className="hero-description">
            The burger that gets it right. The cheese that actually melts. Find
            alternatives to the foods you love, ranked by people who’ve tried
            them.
          </p>
          <div
            className="category-strip"
            aria-label="Categories we’re starting with"
          >
            <span>Burgers</span>
            <span>Milk</span>
            <span>Cheese</span>
            <span>Butter</span>
            <span>Eggs</span>
          </div>
          <div className="coming-note">
            <span className="leaf-mark" aria-hidden="true">
              ↗
            </span>
            <p>
              A better way to find your next favorite.
              <br />
              <strong>We’re getting things ready.</strong>
            </p>
          </div>
        </section>
        <section
          className="principles"
          aria-label="What makes VeganAlts different"
        >
          <article>
            <span className="step-number">01</span>
            <h2>Find your match</h2>
            <p>
              Start with what you want to replace. Discover alternatives
              available in your country.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h2>Real people. Real experience.</h2>
            <p>
              Ranked by how closely they match the original, with more feedback
              making the picture clearer.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h2>Independent by design</h2>
            <p>
              Community experience shapes the rankings. Brands can never buy
              their way to the top.
            </p>
          </article>
        </section>
      </main>
      <footer className="site-footer">
        <p>Community-ranked vegan alternatives.</p>
        <p>Made for your next good swap.</p>
      </footer>
    </div>
  );
}
