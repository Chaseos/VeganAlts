import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { requirePageUser } from "@server/auth/http/require-page-user";
import { publicLoader } from "@server/catalog/http/loader";
import { productPath } from "@server/catalog/domain/markets";
import { savedProductsService } from "@server/saved/infrastructure/composition";
import { ProductImage } from "../components/catalog";
import { PageShell } from "../components/layout/page-shell";
import { SaveButton } from "../components/save-button";
import { ButtonLink } from "../components/ui/button";
import { EmptyState } from "../components/ui/feedback";
import { productName } from "../lib/format";
import { t } from "../i18n";
import type { Route } from "./+types/saved";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requirePageUser(request, env);
  return publicLoader(() =>
    savedProductsService(env).list(
      user.id,
      new URL(request.url).searchParams.get("cursor"),
    ),
  );
}
export function meta() {
  return [
    { title: t("saved.metaTitle") },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function Saved({ loaderData: data }: Route.ComponentProps) {
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">{t("saved.eyebrow")}</p>
        <h1>{t("saved.title")}</h1>
        <p>{t("saved.intro")}</p>
      </header>
      {!data.items.length ? (
        <EmptyState
          title={t("saved.emptyTitle")}
          actions={<ButtonLink to="/">{t("saved.find")}</ButtonLink>}
        >
          {t("saved.emptyBody")}
        </EmptyState>
      ) : (
        <ul className="va-divided va-my-ratings va-saved-list">
          {data.items.map((item) => {
            const name = productName(item.name, item.brand);
            return (
              <li key={item.productId}>
                <ProductImage id={item.imageId} name={name} />
                <div className="va-my-ratings__body">
                  <h2 className="va-heading-s">
                    <Link to={productPath(item.country, item.slug)}>
                      {name}
                    </Link>
                  </h2>
                  {item.flavor && (
                    <p className="small">
                      {t("product.flavor", { flavor: item.flavor })}
                    </p>
                  )}
                  {item.lifecycleStatus === "discontinued" && (
                    <p className="small muted">{t("saved.discontinued")}</p>
                  )}
                </div>
                <SaveButton
                  productId={item.productId}
                  productName={name}
                  initiallySaved
                />
              </li>
            );
          })}
        </ul>
      )}
      {(data.nextCursor || data.items.length === 20) && (
        <nav className="pagination" aria-label={t("saved.pages")}>
          <Link className="button secondary" to="/saved">
            {t("saved.recent")}
          </Link>
          <span />
          {data.nextCursor ? (
            <Link
              className="button secondary"
              to={`/saved?cursor=${encodeURIComponent(data.nextCursor)}`}
              rel="next"
            >
              {t("saved.older")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageShell>
  );
}
