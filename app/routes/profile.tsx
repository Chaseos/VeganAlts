import { env } from "cloudflare:workers";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import { SiteShell } from "../components/catalog";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/profile";

export async function loader({ params }: Route.LoaderArgs) {
  requireCatalogPreview(env.APP_ENV);
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
    <SiteShell compact>
      <header className="page-heading">
        <div className="profile-avatar" aria-hidden="true">
          {(profile.displayName || profile.handle).charAt(0).toUpperCase()}
        </div>
        <p className="eyebrow">Community contributor</p>
        <h1>{profile.displayName || `@${profile.handle}`}</h1>
        <p>@{profile.handle}</p>
      </header>
      <dl className="contribution-counts">
        <div>
          <dt>Ratings shared</dt>
          <dd>{profile.ratingCount}</dd>
        </div>
        <div>
          <dt>Formulas tried</dt>
          <dd>{profile.triedCount}</dd>
        </div>
      </dl>
      <p className="muted">
        Every shared experience helps someone find their next favorite.
        Individual rating histories are private.
      </p>
    </SiteShell>
  );
}
