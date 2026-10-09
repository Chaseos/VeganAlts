import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { requirePageUser } from "@server/auth/http/require-page-user";
import { personalRatingsService } from "@server/ratings/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { ProductImage } from "../components/catalog";
import { PageShell } from "../components/layout/page-shell";
import { EmptyState } from "../components/ui/feedback";
import { ButtonLink } from "../components/ui/button";
import type { MyRating } from "@server/ratings/domain/contracts";
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
    { title: "My ratings · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const SCORE_WORDS = [
  "",
  "not close",
  "slightly similar",
  "fairly close",
  "very close",
  "extremely close",
];

function ratingHref(rating: MyRating, anchor: boolean) {
  if (rating.archivedDuplicate)
    return `/${rating.country}/products/${rating.canonicalSlug}`;
  const version = rating.isCurrent ? "" : `?version=${rating.productVersionId}`;
  const hash = !anchor
    ? ""
    : rating.canRate
      ? `#rate-${rating.categoryId}`
      : "#formula-history";
  return `/${rating.country}/products/${rating.productSlug}${version}${hash}`;
}

export default function MyRatings({ loaderData: data }: Route.ComponentProps) {
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">Your experience, remembered</p>
        <h1>My ratings</h1>
        <p>Only you can see this history. Most recently updated first.</p>
      </header>
      {!data.items.length ? (
        <EmptyState
          title="Your next favorite is waiting."
          actions={<ButtonLink to="/">Find an alternative</ButtonLink>}
        >
          Explore a food, try an alternative, and share how close it comes.
        </EmptyState>
      ) : (
        <ul className="va-divided va-my-ratings">
          {data.items.map((rating) => (
            <li key={rating.id}>
              <ProductImage id={rating.imageId} name={rating.productName} />
              <div className="va-my-ratings__body">
                {rating.brand && (
                  <span className="small muted">{rating.brand}</span>
                )}
                <h2 className="va-heading-s">
                  <Link to={ratingHref(rating, true)}>
                    {rating.productName}
                  </Link>
                </h2>
                <p className="small">
                  As {rating.categoryName.toLowerCase()} · You said{" "}
                  <strong>
                    {rating.overallSimilarity},{" "}
                    {SCORE_WORDS[rating.overallSimilarity]}
                  </strong>
                </p>
                <p className="small muted">
                  {rating.versionLabel} ·{" "}
                  {rating.archivedDuplicate
                    ? "Archived duplicate · Your rating is preserved here"
                    : rating.isCurrent
                      ? "Current formula"
                      : "Historical rating"}{" "}
                  ·{" "}
                  <time dateTime={new Date(rating.updatedAt).toISOString()}>
                    {new Date(rating.updatedAt).toLocaleDateString("en-US", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    })}
                  </time>
                </p>
              </div>
              <ButtonLink
                variant="secondary"
                small
                to={ratingHref(rating, true)}
              >
                {rating.archivedDuplicate
                  ? "View canonical product"
                  : rating.canRate
                    ? "Edit rating"
                    : "View history"}
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
      <nav className="pagination" aria-label="My ratings pages">
        <Link className="button secondary" to="/my-ratings">
          Most recent
        </Link>
        <span />
        {data.nextCursor ? (
          <Link
            className="button secondary"
            to={`/my-ratings?cursor=${encodeURIComponent(data.nextCursor)}`}
            rel="next"
          >
            Older ratings
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageShell>
  );
}
