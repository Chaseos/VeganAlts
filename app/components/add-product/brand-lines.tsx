import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { BrandLine } from "@server/community/domain/contracts";
import { communityRequest } from "../../lib/community";
import { plural } from "../../lib/format";
import { productPath } from "../../lib/site-chrome";

export type { BrandLine };

// A flavor's name in its line: the flavor, "Original", or the product name
// when several have no flavor (as on food pages).
const flavorLabel = (line: BrandLine, flavor: BrandLine["flavors"][number]) =>
  flavor.flavor ??
  (line.flavors.filter((f) => f.flavor === null).length > 1
    ? flavor.name
    : "Original");

/**
 * "Already listed from [brand]" (milestone 7): the brand's lines in the
 * country, those in the chosen food first and the rest collapsed. Each
 * flavor offers "That's it, rate it"; each line offers a new flavor; the
 * list ends with something else from the brand. A brand with nothing listed
 * here goes straight on (`onNothing`).
 */
export function BrandLines({
  country,
  brand,
  food,
  onFlavor,
  onSomethingElse,
  onNothing,
  error,
}: {
  country: string;
  brand: { id: string; name: string };
  food: { id: string; slug: string } | null;
  onFlavor: (line: BrandLine) => void;
  onSomethingElse: () => void;
  onNothing: () => void;
  error?: string;
}) {
  const [lines, setLines] = useState<BrandLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const code = country.toLowerCase();
  useEffect(() => {
    let live = true;
    setLines(null);
    setFailed(false);
    const query = new URLSearchParams({
      country,
      ...(food ? { food: food.id } : {}),
    });
    void communityRequest<BrandLine[]>(
      `community/brands/${brand.id}/lines?${query}`,
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
    };
    // The callbacks change identity on each render; the list depends only
    // on these.
  }, [country, brand.id, food?.id]);
  if (failed)
    return (
      <div className="va-listed" id="brand-lines">
        <p>We couldn’t check what’s listed from {brand.name}.</p>
        <button
          type="button"
          className="button secondary"
          onClick={onSomethingElse}
        >
          Add it anyway
        </button>
      </div>
    );
  if (!lines)
    return (
      <p className="va-listed" id="brand-lines" role="status">
        Checking what’s listed from {brand.name}…
      </p>
    );
  if (!lines.length) return null;
  const here = food
    ? lines.filter((line) => line.foods.some((f) => f.id === food.id))
    : lines;
  const elsewhere = lines.filter((line) => !here.includes(line));
  // `other`: a line in another food, named with its foods.
  const card = (line: BrandLine, other = false) => {
    const foodSlug =
      food && line.foods.some((f) => f.id === food.id)
        ? food.slug
        : line.foods[0]?.slug;
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
              <span>{flavorLabel(line, flavor)}</span>
              <Link
                className="button secondary small-button"
                to={`${productPath(code, flavor.slug, foodSlug)}#scores-title`}
              >
                That’s it, rate it
                <span className="sr-only">: {flavor.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="link-button"
          onClick={() => onFlavor(line)}
        >
          Add a new flavor of {line.name}
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
        Already listed from {brand.name}
      </h3>
      <p className="small muted">
        Found it here? Rate it instead of adding it again. A flavor that isn’t
        listed joins its line.
      </p>
      {here.length > 0 ? (
        <ul className="va-listed__lines">{here.map((line) => card(line))}</ul>
      ) : (
        <p>Nothing from {brand.name} is listed for this food yet.</p>
      )}
      {elsewhere.length > 0 && (
        <details className="va-listed__more">
          <summary>
            {plural(elsewhere.length, "line")} from {brand.name} in other foods
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
        Something else from {brand.name}
      </button>
    </section>
  );
}
