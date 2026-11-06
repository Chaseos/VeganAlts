import { friendly } from "../../lib/community";
import type { ReactNode } from "react";
import { Icon } from "../icons/icon";
import { counted } from "../../lib/counted";
import { joinList } from "../../lib/format";
import { t, type MessageKey } from "../../i18n";

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
  return <Badge tone="early">{counted("badge.early", count)}</Badge>;
}

export function NewBadge() {
  return <Badge tone="new">{t("badge.new")}</Badge>;
}

// One of the top trending lines in its food, shown outside the Trending view.
export function TrendingBadge() {
  return <Badge tone="new">{t("badge.trending")}</Badge>;
}

// Foods and products sold only part of the year use the same label.
export function SeasonalBadge() {
  return <Badge tone="neutral">{t("badge.seasonal")}</Badge>;
}

const VEGAN_STATUS: Record<string, { label: MessageKey; tone: string }> = {
  vegan: { label: "status.vegan", tone: "vegan" },
  appears_plant_based: { label: "status.appearsPlantBased", tone: "appears" },
  plant_based: { label: "status.plantBased", tone: "plant" },
  under_review: { label: "status.underReview", tone: "review" },
  // Not a vegan status: no one has confirmed the ingredients (milestone 6).
  unchecked: { label: "status.unchecked", tone: "unchecked" },
};

export const veganStatusLabel = (status: string) =>
  VEGAN_STATUS[status] ? t(VEGAN_STATUS[status].label) : friendly(status);

export function VeganStatusChip({ status }: { status: string }) {
  const known = VEGAN_STATUS[status];
  if (!known) return null;
  return (
    <span className={`va-status va-status--${known.tone}`}>
      {status === "vegan" && <Icon name="check" size={14} strokeWidth={3} />}
      {status === "under_review" && (
        <Icon name="clock" size={14} strokeWidth={2.4} />
      )}
      {t(known.label)}
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
      ? t("allergen.none")
      : t("allergen.contains", { list: contains.join(", ") });
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
        ? t("allergen.mayContain", {
            list: joinList(
              allergens.mayContain.map((a) => a.label.toLowerCase()),
            ),
          })
        : null}
    </span>
  );
}

export function CheckThePackage({ children }: { children?: ReactNode }) {
  return (
    <p className="va-caption va-muted va-check-package">
      {children ?? t("allergen.fromLabels")} {t("allergen.checkPackage")}
    </p>
  );
}
