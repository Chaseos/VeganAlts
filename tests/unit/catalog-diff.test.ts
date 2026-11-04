import { expect, it } from "vitest";
import {
  catalogReferenceIds,
  reversalChanges,
} from "../../server/community/domain/catalog-diff";

it("previews restored catalog values without promising to delete a created line or restore an identity key", () => {
  const changes = reversalChanges(
    {
      name: "Old name",
      familyId: "old-line",
      categories: [{ categoryId: "food", eligible: true }],
    },
    {
      name: "New name",
      familyId: "new-line",
      categories: [{ categoryId: "food", eligible: false }],
      newLine: { id: "new-line", name: "New line", slug: "new-line" },
      identityKey: "new-identity",
    },
  );
  expect(changes.map((c) => c.field)).toEqual([
    "name",
    "familyId",
    "categories",
  ]);
  expect(changes[2]).toMatchObject({
    recorded: [{ categoryId: "food", eligible: false }],
    restore: [{ categoryId: "food", eligible: true }],
  });
  expect(reversalChanges({ name: "Same" }, { name: "Same" })).toEqual([]);
});

it("resolves affected formulas, photos, foods and lines while leaving notes as text", () => {
  expect(
    catalogReferenceIds({
      currentVersionId: "formula",
      familyId: "line",
      imageStates: [{ id: "image", state: "accepted" }],
      addedCategories: ["food"],
      note: "private note",
    }),
  ).toEqual(["formula", "line", "image", "food"]);
});

it("explains inverse food membership operations as ranking eligibility changes", () => {
  expect(
    reversalChanges(
      { removedCategories: ["brownies"] },
      { addedCategories: ["brownies"] },
    ),
  ).toEqual([
    {
      field: "removedCategories",
      label: "Remove from food rankings",
      recorded: [{ categoryId: "brownies", eligible: true }],
      restore: [{ categoryId: "brownies", eligible: false }],
    },
  ]);
});
