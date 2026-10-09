// Direction D, the tagged wordmark: "Vegan" followed by "Alts" on a yellow
// shelf label that stays yellow in every theme and on the kale header.
export function Wordmark({
  size = "header",
}: {
  size?: "header" | "phone" | "footer" | "hero";
}) {
  return (
    <span className={`va-wordmark va-wordmark--${size}`}>
      Vegan<span className="va-wordmark__tag">Alts</span>
    </span>
  );
}
