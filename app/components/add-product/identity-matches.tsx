import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Candidate } from "@server/community/domain/contracts";
import { communityRequest } from "../../lib/community";
import { productPath } from "../../lib/site-chrome";

/**
 * "Is it one of these?" while someone types the brand and name. It never
 * blocks typing; an exact match is reported so Continue can explain it.
 */
export function IdentityMatches({
  country,
  brand,
  name,
  onExact,
}: {
  country: string;
  brand: string;
  name: string;
  onExact: (match: Candidate | null) => void;
}) {
  const [matches, setMatches] = useState<Candidate[]>([]);
  const ready = brand.trim().length >= 2 && name.trim().length >= 2;
  useEffect(() => {
    if (!ready) {
      setMatches([]);
      onExact(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        country,
        brand: brand.trim(),
        name: name.trim(),
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
  }, [country, brand, name, ready, onExact]);
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
  if (!matches.length) return null;
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
