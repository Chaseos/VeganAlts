import { env } from "cloudflare:workers";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { formatCount } from "../lib/format";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/profile";

export async function loader({ params }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  return publicLoader(async () => ({
    profile: await catalogService(env).profile(params.handle),
    origin: env.APP_URL,
    staging: env.APP_ENV !== "production",
  }));
}
export function meta({ loaderData: data }: Route.MetaArgs) {
  return publicMetadata(
    data ? `@${data.profile.handle}` : "Contributor",
    "A member of the VeganAlts community. Explore their contribution summary.",
    `/users/${data?.profile.handle ?? ""}`,
    data?.origin ?? "https://veganalts.com",
    data?.staging ?? true,
  );
}
export default function Profile({
  loaderData: { profile },
}: Route.ComponentProps) {
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading va-profile-heading">
        <div className="va-initial-tile" aria-hidden="true">
          {(profile.displayName || profile.handle).charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="eyebrow">Community contributor</p>
          <h1>{profile.displayName || `@${profile.handle}`}</h1>
          <p>@{profile.handle}</p>
        </div>
      </header>
      <dl className="va-stat-grid">
        <div className="va-card">
          <dt>Ratings shared</dt>
          <dd>{formatCount(profile.ratingCount)}</dd>
        </div>
        <div className="va-card">
          <dt>Formulas tried</dt>
          <dd>{formatCount(profile.triedCount)}</dd>
        </div>
      </dl>
      <p className="muted section-space">
        Every shared experience helps someone find their next favorite.
        Individual rating histories are private.
      </p>
    </PageShell>
  );
}
