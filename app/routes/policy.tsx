import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { requireCatalogPreview } from "@server/catalog/http/loader";
import { SiteShell } from "../components/catalog";
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
    <SiteShell compact>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{policy.title}</span>
      </nav>
      <article className="policy">
        <header className="page-heading">
          <p className="eyebrow">About VeganAlts</p>
          <h1>{policy.title}</h1>
          <p>{policy.description}</p>
        </header>
        {policy.body(data.contact)}
        <nav aria-label="Other policies" className="policy-links">
          {Object.entries(POLICIES).map(([slug, p]) => (
            <Link
              key={slug}
              to={`/about/${slug}`}
              aria-current={slug === data.page ? "page" : undefined}
            >
              {p.title}
            </Link>
          ))}
        </nav>
      </article>
    </SiteShell>
  );
}
