import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Candidate } from "@server/community/domain/contracts";
import { communityRequest } from "../../lib/community";
import { productPath } from "../../lib/site-chrome";

/**
 * "Is it one of these?" while someone types the name: similar products here
 * from any brand, one shared word being enough (milestone 7). It never
 * blocks typing; an exact match is reported so Continue can explain it.
 */
export function IdentityMatches({
  country,
  brand,
  name,
  lineId = null,
  onExact,
}: {
  country: string;
  brand: string;
  name: string;
  // The line a new flavor joins: its flavors are siblings, not matches,
  // and the brand's lines were just shown, so only an exact match is.
  lineId?: string | null;
  onExact: (match: Candidate | null) => void;
}) {
  const [matches, setMatches] = useState<Candidate[]>([]);
  const lastCountry = useRef(country);
  // Like other lookups while typing, from three characters of the name.
  const ready = brand.trim().length >= 2 && name.trim().length >= 3;
  useEffect(() => {
    if (!ready) {
      setMatches([]);
      onExact(null);
      return;
    }
    // A different brand or name is no longer that exact match; the other
    // suggestions stay until the new lookup answers. Another country's
    // products never do.
    const moved = lastCountry.current !== country;
    lastCountry.current = country;
    setMatches((found) => (moved ? [] : found.filter((c) => !c.exact)));
    onExact(null);
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        country,
        brand: brand.trim(),
        name: name.trim(),
        ...(lineId ? { line: lineId } : {}),
      });
      void communityRequest<Candidate[]>(`community/identity-matches?${query}`)
        .then((found) => {
          if (!active) return;
          setMatches(found);
          onExact(found.find((c) => c.exact) ?? null);
        })
        // Matching is a convenience; publishing checks duplicates again, so
        // a failed check forgets any earlier exact match too.
        .catch(() => {
          if (!active) return;
          setMatches([]);
          onExact(null);
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [country, brand, name, lineId, ready, onExact]);
  const exact = matches.find((c) => c.exact);
  const code = country.toLowerCase();
  if (exact)
    return (
      <div className="notice" role="status">
        <strong className="notice-title">Already on VeganAlts</strong>
        <p>
          {exact.brand ? `${exact.brand} · ` : ""}
          {exact.name} is already listed, including other package sizes.{" "}
          <Link to={`${productPath(code, exact.slug)}#scores-title`}>
            Rate it
          </Link>{" "}
          instead, or change the name if this is a different flavor or formula.
        </p>
      </div>
    );
  if (!matches.length || lineId) return null;
  return (
    <div className="va-matches" role="status">
      <p className="va-matches__title">Is it one of these?</p>
      <ul className="va-divided">
        {matches.slice(0, 5).map((c) => (
          <li key={c.id}>
            <Link to={productPath(code, c.slug)}>
              {c.brand ? `${c.brand} · ` : ""}
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="small muted">
        If not, carry on. Different flavors and formulas are separate products.
      </p>
    </div>
  );
}
