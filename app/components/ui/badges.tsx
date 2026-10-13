import type { ReactNode } from "react";
import { Icon } from "../icons/icon";
import { joinList, plural } from "../../lib/format";
import { seasonLabel, type Season } from "@server/taxonomy/domain/season";

export type BadgeTone =
  "early" | "new" | "detail" | "neutral" | "good" | "warn";

// Badges always carry words; color is never the only difference.
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={`va-badge va-badge--${tone}`}>{children}</span>;
}

// Rankings count people: each person counts once per line (milestone 7).
export function EarlyBadge({ count }: { count: number }) {
  return (
    <Badge tone="early">Early · {plural(count, "person", "people")}</Badge>
  );
}

export function NewBadge() {
  return <Badge tone="new">New</Badge>;
}

// One of the top trending lines in its food, shown outside the Trending view.
export function TrendingBadge() {
  return <Badge tone="new">Trending</Badge>;
}

// A product sold only part of the year (milestone 7).
export function SeasonalProductBadge() {
  return <Badge tone="neutral">Seasonal</Badge>;
}

// A seasonal food stays listed all year; the badge says when it is sold.
export function SeasonBadge({ season }: { season: Season }) {
  return <Badge tone="neutral">Seasonal · {seasonLabel(season)}</Badge>;
}

const VEGAN_STATUS: Record<string, { label: string; tone: string }> = {
  vegan: { label: "Vegan", tone: "vegan" },
  appears_vegan: { label: "Appears vegan", tone: "appears" },
  plant_based: { label: "Plant-based", tone: "plant" },
  under_review: { label: "Under review", tone: "review" },
  // Not a vegan status: no one has confirmed the ingredients (milestone 6).
  unchecked: { label: "Ingredients not checked yet", tone: "unchecked" },
};

export const veganStatusLabel = (status: string) =>
  VEGAN_STATUS[status]?.label ?? status.replaceAll("_", " ");

export function VeganStatusChip({ status }: { status: string }) {
  const known = VEGAN_STATUS[status];
  if (!known) return null;
  return (
    <span className={`va-status va-status--${known.tone}`}>
      {status === "vegan" && <Icon name="check" size={14} strokeWidth={3} />}
      {status === "under_review" && (
        <Icon name="clock" size={14} strokeWidth={2.4} />
      )}
      {known.label}
    </span>
  );
}

export interface AllergenSummary {
  status: "declared" | "none_declared";
  contains: { key: string; label: string }[];
  mayContain: { key: string; label: string }[];
}

// "Contains soy, wheat" or "No major allergens on the label". Products without
// a confirmed declaration show nothing rather than implying they are safe.
export function AllergenLabel({
  allergens,
  variant = "chip",
}: {
  allergens: AllergenSummary | null | undefined;
  variant?: "chip" | "line";
}) {
  if (!allergens) return null;
  const contains = allergens.contains.map((a) => a.label.toLowerCase());
  const text =
    allergens.status === "none_declared" || !contains.length
      ? "No major allergens on the label"
      : `Contains ${contains.join(", ")}`;
  const warn = allergens.status === "declared" && contains.length > 0;
  return (
    <span
      className={
        variant === "chip"
          ? `va-allergen${warn ? " va-allergen--contains" : ""}`
          : "va-allergen-line"
      }
    >
      {text}
      {allergens.mayContain.length > 0 && variant === "line"
        ? ` · may contain ${joinList(allergens.mayContain.map((a) => a.label.toLowerCase()))}`
        : null}
    </span>
  );
}

export function CheckThePackage({ children }: { children?: ReactNode }) {
  return (
    <p className="va-caption va-muted va-check-package">
      {children ??
        "Allergens come from package labels and can change with a recipe."}{" "}
      Always check the package.
    </p>
  );
}
