import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { requirePageUser } from "@server/auth/http/require-page-user";
import { personalRatingsService } from "@server/ratings/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { EmptyState, ProductImage, SiteShell } from "../components/catalog";
import type { Route } from "./+types/my-ratings";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requirePageUser(request, env);
  return publicLoader(() =>
    personalRatingsService(env).list(
      user.id,
      new URL(request.url).searchParams.get("cursor"),
    ),
  );
}
export function meta() {
  return [
    { title: "My Ratings · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default function MyRatings({ loaderData: data }: Route.ComponentProps) {
  return (
    <SiteShell>
      <header className="page-heading">
        <p className="eyebrow">Your experience, remembered</p>
        <h1>My Ratings</h1>
        <p>Only you can see this history. Most recently updated first.</p>
      </header>
      {!data.items.length ? (
        <EmptyState title="Your next favorite is waiting.">
          Explore a category, try an alternative, and share how close it comes.{" "}
          <Link to="/us/search">Find an alternative →</Link>
        </EmptyState>
      ) : (
        <ul className="my-ratings-list">
          {data.items.map((rating) => (
            <li key={rating.id}>
              <ProductImage id={rating.imageId} name={rating.productName} />
              <div>
                <span className="product-brand">{rating.brand}</span>
                <h2>
                  <Link
                    to={
                      rating.archivedDuplicate
                        ? `/us/products/${rating.canonicalSlug}`
                        : `/us/products/${rating.productSlug}${rating.isCurrent ? "" : `?version=${rating.productVersionId}`}#rate-${rating.categoryId}`
                    }
                  >
                    {rating.productName}
                  </Link>
                </h2>
                <p>
                  As {rating.categoryName.toLowerCase()} ·{" "}
                  <strong>{rating.overallSimilarity}/5</strong>
                </p>
                <p className="small muted">
                  {rating.versionLabel} ·{" "}
                  {rating.archivedDuplicate
                    ? "Archived duplicate · Your rating is preserved here"
                    : rating.isCurrent
                      ? "Current formula"
                      : "Historical rating"}
                </p>
                <time
                  className="small muted"
                  dateTime={new Date(rating.updatedAt).toISOString()}
                >
                  {new Date(rating.updatedAt).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}
                </time>
              </div>
              <Link
                className="button secondary"
                to={
                  rating.archivedDuplicate
                    ? `/us/products/${rating.canonicalSlug}`
                    : `/us/products/${rating.productSlug}${rating.isCurrent ? "" : `?version=${rating.productVersionId}`}#${rating.canRate ? `rate-${rating.categoryId}` : "formula-history"}`
                }
              >
                {rating.archivedDuplicate
                  ? "View canonical product"
                  : rating.canRate
                    ? "Edit rating"
                    : "View history"}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="pagination" aria-label="My Ratings pages">
        <Link to="/my-ratings">Most recent</Link>
        {data.nextCursor && (
          <Link
            to={`/my-ratings?cursor=${encodeURIComponent(data.nextCursor)}`}
            rel="next"
          >
            Older ratings →
          </Link>
        )}
      </nav>
    </SiteShell>
  );
}
