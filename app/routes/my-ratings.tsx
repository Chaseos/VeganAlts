import { pageLocale } from "../i18n";
import { productPath } from "@server/catalog/domain/markets";
import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { requirePageUser } from "@server/auth/http/require-page-user";
import { personalRatingsService } from "@server/ratings/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { ProductImage } from "../components/catalog";
import { PageShell } from "../components/layout/page-shell";
import { EmptyState } from "../components/ui/feedback";
import { ButtonLink } from "../components/ui/button";
import { tasteMeanings } from "../components/rating-control";
import { inSentence, productName } from "../lib/format";
import type { MyRating } from "@server/ratings/domain/contracts";
import { t } from "../i18n";
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
    { title: t("myRatings.metaTitle") },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const scoreWords = () => [
  "",
  t("myRatings.close1"),
  t("myRatings.close2"),
  t("myRatings.close3"),
  t("myRatings.close4"),
  t("myRatings.close5"),
];

function ratingHref(rating: MyRating, anchor: boolean) {
  if (rating.archivedDuplicate)
    return productPath(
      rating.country,
      rating.canonicalSlug ?? rating.productSlug,
    );
  const params = new URLSearchParams();
  if (!rating.isCurrent) params.set("version", rating.productVersionId);
  if (rating.canRate) params.set("food", rating.categorySlug);
  const query = params.size ? `?${params}` : "";
  const hash = !anchor
    ? ""
    : rating.canRate
      ? `#rate-${rating.categoryId}`
      : "#formula-history";
  return `${productPath(rating.country, rating.productSlug)}${query}${hash}`;
}

export default function MyRatings({ loaderData: data }: Route.ComponentProps) {
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">{t("myRatings.eyebrow")}</p>
        <h1>{t("myRatings.title")}</h1>
        <p>{t("myRatings.intro")}</p>
      </header>
      {!data.items.length ? (
        <EmptyState
          title={t("myRatings.emptyTitle")}
          actions={<ButtonLink to="/">{t("saved.find")}</ButtonLink>}
        >
          {t("myRatings.emptyBody")}
        </EmptyState>
      ) : (
        <ul className="va-divided va-my-ratings">
          {data.items.map((rating) => (
            <li key={rating.id}>
              <ProductImage
                id={rating.imageId}
                name={productName(rating.productName, rating.brand)}
              />
              <div className="va-my-ratings__body">
                <h2 className="va-heading-s">
                  <Link to={ratingHref(rating, true)}>
                    {productName(rating.productName, rating.brand)}
                  </Link>
                </h2>
                <p className="small">
                  {t("myRatings.as", {
                    food: inSentence(rating.categoryName),
                  })}
                  {rating.overallSimilarity !== null && (
                    <>
                      {" "}
                      · {t("myRatings.closeness")}{" "}
                      <strong>
                        {rating.overallSimilarity},{" "}
                        {scoreWords()[rating.overallSimilarity]}
                      </strong>
                    </>
                  )}
                  {rating.enjoyment !== null && (
                    <>
                      {" "}
                      · {t("myRatings.taste")}{" "}
                      <strong>
                        {rating.enjoyment},{" "}
                        {tasteMeanings()[rating.enjoyment - 1]}
                      </strong>
                    </>
                  )}
                </p>
                <p className="small muted">
                  {rating.versionLabel} ·{" "}
                  {rating.archivedDuplicate
                    ? t("myRatings.archived")
                    : rating.isCurrent
                      ? t("myRatings.current")
                      : t("myRatings.historical")}{" "}
                  ·{" "}
                  <time dateTime={new Date(rating.updatedAt).toISOString()}>
                    {new Date(rating.updatedAt).toLocaleDateString(
                      pageLocale(),
                      {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      },
                    )}
                  </time>
                </p>
              </div>
              <ButtonLink
                variant="secondary"
                small
                to={ratingHref(rating, true)}
              >
                {rating.archivedDuplicate
                  ? t("myRatings.viewCanonical")
                  : rating.canRate
                    ? t("myRatings.edit")
                    : t("myRatings.viewHistory")}
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
      <nav className="pagination" aria-label={t("myRatings.pages")}>
        <Link className="button secondary" to="/my-ratings">
          {t("saved.recent")}
        </Link>
        <span />
        {data.nextCursor ? (
          <Link
            className="button secondary"
            to={`/my-ratings?cursor=${encodeURIComponent(data.nextCursor)}`}
            rel="next"
          >
            {t("myRatings.older")}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageShell>
  );
}
