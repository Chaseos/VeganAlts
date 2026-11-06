import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { pageLanguage } from "@server/catalog/domain/markets";
import { publicCatalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { AisleSelect, NewAisleField } from "../components/aisle-select";
import {
  CommunityControls,
  CommunityFeedback,
  GuidelinesNote,
} from "../components/community-form";
import { useCommunityAction } from "../lib/community";
import { t } from "../i18n";
import type { Route } from "./+types/propose-category";

export async function loader({ request }: Route.LoaderArgs) {
  await communityPageActor(request, env);
  const url = new URL(request.url);
  // A food is proposed for the country the visitor came from.
  const catalog = publicCatalogService(env, pageLanguage() ?? "en");
  const market = await publicLoader(() =>
    catalog.market(url.searchParams.get("country") ?? "us"),
  );
  return {
    siteKey: env.TURNSTILE_SITE_KEY,
    market,
    aisles: await catalog.aisles(market),
    aisle: url.searchParams.get("aisle") ?? "",
    name: url.searchParams.get("name") ?? "",
  };
}
export function meta() {
  return [
    { title: t("suggestFood.metaTitle") },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export default function ProposeCategory({
  loaderData: { siteKey, market, aisles, aisle, name: initialName },
}: Route.ComponentProps) {
  const action = useCommunityAction();
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [aisleId, setAisleId] = useState(
    aisles.find((a) => a.slug === aisle || a.id === aisle)?.id ?? "",
  );
  const [newAisle, setNewAisle] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const explanation = String(form.get("explanation") ?? "").trim();
    const done = await action.run(() =>
      action.request("category-proposals", {
        name,
        aisleId,
        country: market.code,
        language: pageLanguage() ?? "en",
        ...(newAisle.trim() ? { newAisle: { name: newAisle.trim() } } : {}),
        ...(explanation ? { explanation } : {}),
        aliases: list(form.get("aliases")).slice(0, 10),
      }),
    );
    if (done) setSaved(name.trim());
  }
  // A product for the food can travel with it, reviewed together.
  const withProduct = new URLSearchParams({ country: market.code });
  if (name.trim()) withProduct.set("newFood", name.trim());
  if (aisleId) withProduct.set("aisle", aisleId);
  return (
    <PageShell width="narrow">
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">{market.name}</p>
          <h1>{t("suggestFood.title")}</h1>
          <p>{t("suggestFood.intro", { country: market.name })}</p>
          <GuidelinesNote />
        </header>
        {saved ? (
          <div className="community-panel" role="status">
            <h2>{t("suggestFood.thanks", { name: saved })}</h2>
            <p>
              {t("suggestFood.reviewBefore")}{" "}
              <Link to="/my-contributions">{t("myContributions.title")}</Link>
              {t("suggestFood.reviewAfter")}
            </p>
          </div>
        ) : (
          <form className="community-form community-panel" onSubmit={submit}>
            <label htmlFor="category-name">{t("suggestFood.nameLabel")}</label>
            <input
              id="category-name"
              name="name"
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <AisleSelect
              id="aisle"
              aisles={aisles}
              value={aisleId}
              onChange={setAisleId}
              required
            />
            <NewAisleField
              id="new-aisle"
              value={newAisle}
              onChange={setNewAisle}
            />
            <label htmlFor="category-aliases">{t("common.aliasesLabel")}</label>
            <input id="category-aliases" name="aliases" maxLength={800} />
            <label htmlFor="category-explanation">
              {t("suggestFood.explanationLabel")}
            </label>
            <textarea
              id="category-explanation"
              name="explanation"
              maxLength={2000}
              rows={3}
            />
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? t("common.sending") : t("suggestFood.submit")}
            </button>
            <p className="small">
              {t("suggestFood.productBefore")}{" "}
              <Link to={`/add-product?${withProduct}`}>
                {t("suggestFood.productLink")}
              </Link>{" "}
              {t("suggestFood.productAfter")}
            </p>
            <CommunityFeedback action={action} siteKey={siteKey} />
          </form>
        )}
      </CommunityControls>
    </PageShell>
  );
}
