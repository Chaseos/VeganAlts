import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { requireCatalogPreview } from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { Breadcrumb } from "../components/ui/navigation";
import { POLICIES } from "../content/policies";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/policy";

export function loader({ params }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  if (!Object.hasOwn(POLICIES, params.page))
    throw new Response("Not found", { status: 404 });
  return {
    page: params.page,
    contact: env.SUPPORT_CONTACT || null,
    origin: env.APP_URL,
    staging: env.APP_ENV !== "production",
  };
}
export function meta({ loaderData: data }: Route.MetaArgs) {
  const policy = data ? POLICIES[data.page] : undefined;
  return publicMetadata(
    policy?.title ?? "About",
    policy?.description ?? "About VeganAlts.",
    `/about/${data?.page ?? ""}`,
    data?.origin ?? "https://veganalts.com",
    data?.staging ?? true,
  );
}
export default function Policy({ loaderData: data }: Route.ComponentProps) {
  const policy = POLICIES[data.page]!;
  return (
    <PageShell width="prose" aisles={false}>
      <Breadcrumb
        items={[{ label: "Home", to: "/" }, { label: policy.title }]}
      />
      <article className="policy">
        <header className="page-heading section-space-sm">
          <p className="eyebrow">About VeganAlts</p>
          <h1>{policy.title}</h1>
          <p>{policy.description}</p>
        </header>
        <div className="va-prose">{policy.body(data.contact)}</div>
        <nav aria-label="Other policies" className="va-card section-space">
          <h2 className="va-heading-s">More about VeganAlts</h2>
          <ul className="va-divided va-link-list">
            {Object.entries(POLICIES).map(([slug, p]) => (
              <li key={slug}>
                <Link
                  to={`/about/${slug}`}
                  aria-current={slug === data.page ? "page" : undefined}
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </PageShell>
  );
}
