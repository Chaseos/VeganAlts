import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreLabel, RankFlag } from "../../app/components/ui/score";
import {
  AllergenLabel,
  EarlyBadge,
  VeganStatusChip,
} from "../../app/components/ui/badges";
import {
  Bar,
  DetailBars,
  DetailCells,
  DistributionBars,
} from "../../app/components/ui/bars";
import { FOOD_ICONS, foodShape } from "../../app/components/icons/food-icons";
import { TAXONOMY_LEAVES, TAXONOMY_GROUPS } from "../../db/seed/taxonomy";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("shared presentation components", () => {
  it("labels scores as scores, never prices", () => {
    expect(html(<ScoreLabel value={4.62} size="large" />)).toContain(
      '4.6</span><span class="va-score__unit">out of 5',
    );
    const compact = html(<ScoreLabel value={3.8} size="compact" />);
    expect(compact).toContain("/5");
    expect(compact).toContain("out of 5");
    expect(html(<ScoreLabel value={3} size="mini" tone="neutral" />)).toContain(
      "va-score--neutral",
    );
    expect(html(<RankFlag>#1 swap</RankFlag>)).toContain("#1 swap");
  });

  it("draws proportional bars without inline styles", () => {
    const bar = html(<Bar percent={62.4} />);
    expect(bar).toContain('width="62%"');
    expect(bar).not.toContain("style=");
    expect(html(<Bar percent={0} />)).not.toContain("va-bar__fill");
    const details = html(
      <DetailBars
        details={[
          { key: "taste", label: "Taste", mean: 4.4, count: 12 },
          { key: "melt", label: "Melt", mean: null, count: 2 },
        ]}
      />,
    );
    expect(details).toContain("Taste");
    expect(details).not.toContain("Melt");
    expect(details).not.toContain("style=");
    const distribution = html(
      <DistributionBars
        label="Overall closeness"
        rows={[
          { label: "Extremely close", count: 3 },
          { label: "Not close", count: 1 },
        ]}
      />,
    );
    expect(distribution).toContain("75%");
    expect(distribution).toContain("25%");
  });

  it("marks the active detail cell and explains missing means", () => {
    const cells = html(
      <DetailCells
        active="taste"
        details={[
          { key: "taste", label: "Taste", mean: 4.25, count: 9 },
          { key: "texture", label: "Texture", mean: null, count: 1 },
        ]}
      />,
    );
    expect(cells).toContain("va-detail-cell--active");
    expect(cells).toContain("4.3");
    expect(cells).toContain("not enough answers yet");
  });

  it("always pairs badges and statuses with words", () => {
    expect(html(<EarlyBadge count={6} />)).toContain("Early · 6 ratings");
    expect(html(<EarlyBadge count={1} />)).toContain("Early · 1 rating");
    expect(html(<VeganStatusChip status="under_review" />)).toContain(
      "Under review",
    );
    expect(html(<VeganStatusChip status="unknown" />)).toBe("");
  });

  it("states allergens only from a confirmed declaration", () => {
    expect(html(<AllergenLabel allergens={null} />)).toBe("");
    expect(
      html(
        <AllergenLabel
          allergens={{
            status: "declared",
            contains: [
              { key: "soy", label: "Soy" },
              { key: "wheat", label: "Wheat" },
            ],
            mayContain: [],
          }}
        />,
      ),
    ).toContain("Contains soy, wheat");
    expect(
      html(
        <AllergenLabel
          allergens={{ status: "none_declared", contains: [], mayContain: [] }}
        />,
      ),
    ).toContain("No major allergens on the label");
  });

  it("has a line icon for every seeded food, aisle and shelf", () => {
    const missing = [...TAXONOMY_GROUPS, ...TAXONOMY_LEAVES]
      .map((c) => c.slug)
      .filter((slug) => foodShape([slug]) === "plate" && slug !== "food");
    expect(missing).toEqual([]);
    expect(foodShape(["brand-new-food", "beef"])).toBe(FOOD_ICONS.beef);
    expect(foodShape(["brand-new-food"])).toBe("plate");
  });
});
