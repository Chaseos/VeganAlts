import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { BrandLine } from "@server/community/domain/contracts";
import { flavorLabel } from "@server/catalog/domain/flavor-label";
import { ProductThumbnail } from "../catalog/product-thumbnail";
import { communityRequest } from "../../lib/community";
import { formatCount } from "../../lib/format";
import { t } from "../../i18n";
import { productPath } from "../../lib/site-chrome";

export type { BrandLine };

/** A brand's lines in a country, for the food list and "Already listed". */
export function useBrandLines(
  country: string,
  brandId: string | null,
  onNothing: () => void,
) {
  const [lines, setLines] = useState<BrandLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLines(null);
    setFailed(false);
    if (!brandId) return;
    let live = true;
    const controller = new AbortController();
    void communityRequest<BrandLine[]>(
      `community/brands/${brandId}/lines?${new URLSearchParams({ country })}`,
      undefined,
      undefined,
      undefined,
      { signal: controller.signal },
    )
      .then((found) => {
        if (!live) return;
        setLines(found);
        if (!found.length) onNothing();
      })
      // Without the list, adding still works; publishing checks duplicates.
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      controller.abort();
    };
    // The callback changes identity on each render; the list doesn't.
  }, [country, brandId, attempt]);
  return { lines, failed, retry: () => setAttempt((value) => value + 1) };
}

/**
 * "Already listed from [brand]" (milestone 7): the brand's lines in the
 * country, those in the chosen food first and the rest collapsed. Each
 * flavor shows its photo and opens its page, offers "That's it, rate it", and
 * each line offers a new flavor; the list ends with something else from the
 * brand. With no food chosen yet, every line shows.
 */
export function BrandLines({
  country,
  brand,
  food,
  lines,
  failed,
  onRetry,
  onFlavor,
  onSomethingElse,
  error,
}: {
  country: string;
  brand: { id: string; name: string };
  food: { id: string; slug: string } | null;
  lines: BrandLine[] | null;
  failed: boolean;
  onRetry: () => void;
  onFlavor: (line: BrandLine) => void;
  onSomethingElse: () => void;
  error?: string;
}) {
  const code = country.toLowerCase();
  if (failed)
    return (
      <div className="va-listed" id="brand-lines">
        <p>{t("addProduct.linesFailed", { brand: brand.name })}</p>
        <button type="button" className="button secondary" onClick={onRetry}>
          {t("addProduct.retry")}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={onSomethingElse}
        >
          {t("addProduct.addAnyway")}
        </button>
      </div>
    );
  if (!lines)
    return (
      <p className="va-listed" id="brand-lines" role="status">
        {t("addProduct.linesChecking", { brand: brand.name })}
      </p>
    );
  if (!lines.length) return null;
  const here = food
    ? lines.filter((line) => line.foods.some((f) => f.id === food.id))
    : lines;
  const elsewhere = lines.filter((line) => !here.includes(line));
  // `other`: a line in another food, named with its foods.
  const card = (line: BrandLine, other = false) => {
    // A flavor opens in the chosen food where it's listed there, else in
    // its first food.
    const foodOf = (flavor: BrandLine["flavors"][number]) =>
      food && flavor.foods.includes(food.slug) ? food.slug : flavor.foods[0];
    return (
      <li key={line.lineId} className="va-listed__line">
        <p className="va-listed__name">
          {line.name}
          {other && line.foods.length > 0 && (
            <span className="va-small va-muted">
              {" "}
              · {line.foods.map((f) => f.name).join(", ")}
            </span>
          )}
        </p>
        <ul className="va-divided va-listed__flavors">
          {line.flavors.map((flavor) => (
            <li key={flavor.productId}>
              <Link
                className="va-listed__product"
                to={productPath(code, flavor.slug, foodOf(flavor))}
              >
                <ProductThumbnail
                  imageId={flavor.imageId}
                  food={foodOf(flavor) ?? "food"}
                  size="small"
                />
                <span>{flavorLabel(flavor, line.flavors)}</span>
                <span className="sr-only">
                  {t("addProduct.openFlavor", { name: flavor.name })}
                </span>
              </Link>
              <Link
                className="button secondary small-button"
                to={`${productPath(code, flavor.slug, foodOf(flavor))}#scores-title`}
              >
                {t("addProduct.thatsIt")}
                <span className="sr-only">
                  {t("addProduct.srName", { name: flavor.name })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="link-button"
          onClick={() => onFlavor(line)}
        >
          {t("addProduct.newFlavorOf", { name: line.name })}
        </button>
      </li>
    );
  };
  return (
    <section
      className="va-listed"
      id="brand-lines"
      aria-labelledby="brand-lines-title"
      aria-describedby={error ? "brand-lines-error" : undefined}
    >
      <h3 id="brand-lines-title" className="va-heading-s">
        {t("addProduct.alreadyListedFrom", { brand: brand.name })}
      </h3>
      <p className="small muted">{t("addProduct.foundIt")}</p>
      {here.length > 0 ? (
        <ul className="va-listed__lines">{here.map((line) => card(line))}</ul>
      ) : (
        <p>{t("addProduct.nothingListed", { brand: brand.name })}</p>
      )}
      {elsewhere.length > 0 && (
        <details className="va-listed__more">
          <summary>
            {t("addProduct.linesElsewhere", {
              count: elsewhere.length,
              number: formatCount(elsewhere.length),
              brand: brand.name,
            })}
          </summary>
          <ul className="va-listed__lines">
            {elsewhere.map((line) => card(line, true))}
          </ul>
        </details>
      )}
      {error && (
        <p id="brand-lines-error" className="field-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={onSomethingElse}
      >
        {t("addProduct.somethingElse", { brand: brand.name })}
      </button>
    </section>
  );
}
