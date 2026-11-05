import { env } from "cloudflare:workers";
import { Form, Link, useLocation } from "react-router";
import {
  productAnalyticsSort,
  RECENT_VIEW_DAYS,
} from "@server/analytics/application/service";
import { productAnalyticsService } from "@server/analytics/infrastructure/composition";
import { catalogPage } from "@server/catalog/application/service";
import { productPath } from "@server/catalog/domain/markets";
import { communityPageActor } from "@server/community/http/page";
import { PageShell } from "../components/layout/page-shell";
import { EmptyState } from "../components/ui/feedback";
import { Pagination, TabLinks } from "../components/ui/navigation";
import { productName } from "../lib/format";
import type { Route } from "./+types/admin-analytics";

export async function loader({ request }: Route.LoaderArgs) {
  await communityPageActor(request, env, true);
  const params = new URL(request.url).searchParams;
  const sort = productAnalyticsSort(params.get("sort"));
  const search = params.get("q") ?? "";
  const page = catalogPage(params.get("page"));
  return {
    sort,
    search,
    page,
    ...(await productAnalyticsService(env).report({ sort, search, page })),
  };
}
export function meta() {
  return [
    { title: "Product analytics · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

const SORTS = [
  { sort: "views", label: "Most viewed" },
  { sort: "saves", label: "Most saved" },
  { sort: "ratings", label: "Most rated" },
] as const;

const count = (value: number) => value.toLocaleString("en-US");

export default function AdminAnalytics({
  loaderData: data,
}: Route.ComponentProps) {
  const { pathname } = useLocation();
  const sortLink = (sort: string) => {
    const params = new URLSearchParams();
    if (sort !== "views") params.set("sort", sort);
    if (data.search) params.set("q", data.search);
    return `${pathname}${params.size ? `?${params}` : ""}`;
  };
  return (
    <PageShell aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">Operator tools</p>
        <h1>Product analytics</h1>
        <p>
          Private to administrators. Views count each product once per browser
          tab and started on the day this page was added. Saves and ratings
          count people.
        </p>
      </header>
      <TabLinks
        label="Sort products"
        tabs={SORTS.map(({ sort, label }) => ({
          to: sortLink(sort),
          label,
          current: data.sort === sort,
        }))}
      />
      <Form method="get" className="va-inline-field va-analytics-search">
        {data.sort !== "views" && (
          <input type="hidden" name="sort" value={data.sort} />
        )}
        <input
          type="search"
          name="q"
          defaultValue={data.search}
          placeholder="Product, brand or flavor"
          aria-label="Find a product"
        />
        <button className="button secondary" type="submit">
          Find
        </button>
      </Form>
      {data.items.length ? (
        <div className="va-analytics-scroll">
          <table className="va-analytics">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Views</th>
                <th scope="col">Last {RECENT_VIEW_DAYS} days</th>
                <th scope="col">Saves</th>
                <th scope="col">Ratings</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link to={productPath(item.country, item.slug)}>
                      {productName(item.name, item.brand)}
                    </Link>
                    <span className="small muted">
                      {[
                        item.flavor,
                        item.country.toUpperCase(),
                        item.lifecycleStatus === "active"
                          ? null
                          : item.lifecycleStatus.replace("_", " "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </th>
                  <td>{count(item.views)}</td>
                  <td>{count(item.recentViews)}</td>
                  <td>{count(item.saves)}</td>
                  <td>{count(item.ratings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No products found.">
          {data.search
            ? "Try a different product, brand or flavor."
            : "Products appear here once they’re in the catalog."}
        </EmptyState>
      )}
      <Pagination page={data.page} hasNext={data.hasNext} label="Analytics" />
    </PageShell>
  );
}
