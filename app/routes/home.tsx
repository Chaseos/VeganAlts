import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { ComingSoon } from "../components/coming-soon";
import {
  CategoryCards,
  ProductRows,
  SearchForm,
  SiteShell,
} from "../components/catalog";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/home";

export async function loader() {
  return {
    staging: env.APP_ENV !== "production",
    origin: env.APP_URL,
    catalog:
      env.APP_ENV === "production"
        ? null
        : await publicLoader(() => catalogService(env).home()),
  };
}
export function meta({ loaderData }: Route.MetaArgs) {
  return publicMetadata(
    "Find the closest vegan alternative",
    "Discover vegan alternatives to the foods you love, ranked by how closely they resemble the original.",
    "/",
    loaderData?.origin ?? "https://veganalts.com",
    loaderData?.staging ?? true,
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (!loaderData.catalog) return <ComingSoon />;
  return (
    <SiteShell>
      <section className="discovery-hero">
        <p className="eyebrow">Good food. Familiar favorites.</p>
        <h1>
          Your favorites.
          <br />
          <em>A little more plant-based.</em>
        </h1>
        <p>
          Find the closest vegan alternatives to the foods you love.
          <br className="desktop-break" /> Ranked by people who’ve tried them.
        </p>
        <SearchForm large />
        <div className="popular-searches">
          <span>Start with</span>
          {loaderData.catalog.featured.slice(0, 3).map((category) => (
            <Link key={category.id} to={`/us/${category.slug}`}>
              {category.name} ↗
            </Link>
          ))}
        </div>
        <span className="hero-sprout" aria-hidden="true">
          <svg viewBox="0 0 160 180" fill="none">
            <path d="M81 165V81" stroke="currentColor" strokeWidth="3" />
            <path
              d="M80 115C12 114 13 43 13 43s66-5 67 72Z"
              fill="#d8e6b1"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M81 84C79 13 144 14 144 14s6 62-63 70Z"
              fill="#c7df86"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m37 69 44 47m0-32 40-44"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </span>
      </section>
      <section className="section-space" aria-labelledby="categories-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A good place to start</p>
            <h2 id="categories-title">What’s on your plate?</h2>
          </div>
          <Link className="text-link" to="/us/search">
            All categories <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <CategoryCards categories={loaderData.catalog.featured} />
      </section>
      {(loaderData.catalog.trending.length > 0 ||
        loaderData.catalog.newest.length > 0) && (
        <div className="discovery-columns">
          {loaderData.catalog.trending.length > 0 && (
            <section aria-labelledby="trending-title">
              <p className="eyebrow">Recent community activity</p>
              <h2 id="trending-title">Trending now</h2>
              <ProductRows products={loaderData.catalog.trending} />
            </section>
          )}
          {loaderData.catalog.newest.length > 0 && (
            <section aria-labelledby="new-title">
              <p className="eyebrow">Added in the last 90 days</p>
              <h2 id="new-title">New alternatives</h2>
              <ProductRows products={loaderData.catalog.newest} />
            </section>
          )}
        </div>
      )}
      <section className="how-it-works" aria-label="How VeganAlts works">
        <div>
          <span>01 / DISCOVER</span>
          <h2>Start with the original.</h2>
          <p>
            Pick a food you want to replace. Every ranking stays specific to
            that food.
          </p>
        </div>
        <div>
          <span>02 / COMPARE</span>
          <h2>Find a closer alternative.</h2>
          <p>
            See community scores with enough context to make your next choice.
          </p>
        </div>
        <div>
          <span>03 / CONTRIBUTE</span>
          <h2>Tried it? Pass it on.</h2>
          <p>
            One quick rating helps the next person find something they’ll love.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
