import { describe, expect, it } from "vitest";
import { TAXONOMY_GROUPS, TAXONOMY_LEAVES } from "../../db/seed/taxonomy";
import {
  nameWords,
  nearDuplicateNames,
  productSlug,
  slug,
} from "../../server/community/domain/policy";
import { catalogProductSlug } from "../../server/community/infrastructure/catalog-entry";
import {
  foldForMatch,
  latinSlug,
  matchKey,
} from "../../server/shared/domain/text";
import { silentAisle } from "../../server/taxonomy/domain/display";
import {
  categoryKey,
  categorySlug,
} from "../../server/taxonomy/domain/taxonomy";

// The definitions these replaced, kept to prove existing names didn't move.
const oldSlug = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const oldKey = (value: string) => oldSlug(value).replaceAll("-", "");

describe("text in any script", () => {
  it("leaves every seeded English name's slug and key alone", () => {
    const names = [
      ...TAXONOMY_GROUPS.map((group) => group.name),
      ...TAXONOMY_LEAVES.flatMap((leaf) => [
        leaf.name,
        ...leaf.aliases,
        ...("displayNames" in leaf ? Object.values(leaf.displayNames) : []),
      ]),
    ];
    expect(names.length).toBeGreaterThan(200);
    for (const name of names) {
      expect(categorySlug(name)).toBe(oldSlug(name));
      expect(categoryKey(name)).toBe(oldKey(name));
    }
  });

  it("gives Japanese names their own keys", () => {
    expect(categoryKey("唐揚げ")).toBe("唐揚げ");
    expect(categoryKey("唐揚げ")).not.toBe(categoryKey("納豆"));
    expect(categoryKey("カラアゲ")).toBe(categoryKey("からあげ"));
    expect(categoryKey("ｶﾗｱｹﾞ")).toBe(categoryKey("からあげ"));
    // Voiced kana stay voiced: け and げ are different letters.
    expect(categoryKey("ケーキ")).not.toBe(categoryKey("ゲーキ"));
    expect(silentAisle({ name: "納豆" }, [{ name: "唐揚げ" }])).toBe(false);
  });

  it("keeps the marks that other scripts spell with", () => {
    expect(matchKey("दूध")).not.toBe(matchKey("दध"));
    expect(matchKey("นม")).toBe("นม");
    expect(matchKey("우유")).toBe("우유");
  });

  it("folds French accents and ligatures", () => {
    expect(foldForMatch("Crème Glacée")).toBe("creme glacee");
    expect(categoryKey("Bœuf haché")).toBe(categoryKey("boeuf hache"));
    expect(categorySlug("Bœuf haché")).toBe("boeuf-hache");
    expect(categorySlug("Tourtière")).toBe("tourtiere");
  });

  it("keeps addresses ASCII, with a fallback for other scripts", () => {
    expect(latinSlug("唐揚げ")).toBe("");
    expect(slug("唐揚げ")).toBe("product");
    expect(slug("マルコメ", "brand")).toBe("brand");
    expect(slug("Beyond Meat")).toBe("beyond-meat");
  });

  it("names a non-Latin product after its food", () => {
    expect(productSlug("みどり食堂 大豆ミートの唐揚げ", "karaage")).toBe(
      "karaage",
    );
    // A package size alone isn't a name.
    expect(productSlug("大豆ミートの唐揚げ 100g", "karaage")).toBe("karaage");
    expect(productSlug("大豆ミートの唐揚げ 100g")).toBe("product");
    expect(productSlug("Beyond Burger 8 oz", "beef-burgers")).toBe(
      "beyond-burger-8-oz",
    );
    expect(
      catalogProductSlug("みどり", "大豆ミート", "abc12345678", "karaage"),
    ).toBe("karaage-12345678");
  });

  it("compares names without spaces by character pairs", () => {
    expect(nameWords("豆腐")).toEqual(["豆腐"]);
    expect(nameWords("Tofu 豆腐")).toEqual(["tofu", "豆腐"]);
    expect(nearDuplicateNames("大豆ミートの唐揚げ", "大豆ミート唐揚げ")).toBe(
      true,
    );
    expect(nearDuplicateNames("大豆ミートハンバーグ", "大豆ミートボール")).toBe(
      false,
    );
    expect(nearDuplicateNames("ヴィーガンハム", "ハム")).toBe(true);
    expect(nearDuplicateNames("カラアゲ", "からあげ")).toBe(true);
  });
});
