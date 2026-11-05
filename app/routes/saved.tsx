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
    { title: "Saved products · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function Saved({ loaderData: data }: Route.ComponentProps) {
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">Your list, for later</p>
        <h1>Saved products</h1>
        <p>Only you can see this list. Most recently saved first.</p>
      </header>
      {!data.items.length ? (
        <EmptyState
          title="Nothing saved yet."
          actions={<ButtonLink to="/">Find an alternative</ButtonLink>}
        >
          Tap the bookmark on a product’s page to keep it here.
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
                    <p className="small">Flavor: {item.flavor}</p>
                  )}
                  {item.lifecycleStatus === "discontinued" && (
                    <p className="small muted">Discontinued</p>
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
        <nav className="pagination" aria-label="Saved products pages">
          <Link className="button secondary" to="/saved">
            Most recent
          </Link>
          <span />
          {data.nextCursor ? (
            <Link
              className="button secondary"
              to={`/saved?cursor=${encodeURIComponent(data.nextCursor)}`}
              rel="next"
            >
              Older saves
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageShell>
  );
}
