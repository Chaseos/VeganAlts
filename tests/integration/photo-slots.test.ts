import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { communityServices } from "../../server/community/infrastructure/composition";
import { changeInput } from "../../server/community/domain/contracts";

const id = () => crypto.randomUUID();
const bytes = (kind: "jpeg" | "png" | "webp") =>
  Uint8Array.from(atob(env.TEST_IMAGES[kind]), (c) => c.charCodeAt(0));
async function fixture() {
  const f = await catalogFixture(env.DB, 5);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const services = communityServices(
    {
      ...env,
      APP_ENV: "local",
      MODERATION_PROVIDER: "fake",
      PROPOSAL_AUTO_APPLY: '{"minAgeHours":0}',
    },
    id,
  );
  const users = f.users.map((u) => ({ ...u, administrator: false }));
  const proposePhoto = async (
    actor: (typeof users)[number],
    slot: "front" | "back" | "ingredients",
    image: "jpeg" | "png" | "webp",
    reason = "missing",
    note = "Clear photo of the current retail package.",
  ) => {
    const { receiptId } = await services.submissions.evidenceReceipt(
      actor,
      id(),
      f.productId,
    );
    const photo = await services.media.upload(actor, {
      receiptId,
      slot,
      idempotencyKey: id(),
      bytes: bytes(image),
    });
    return {
      photo,
      result: await services.contributions.propose(
        actor,
        id(),
        changeInput.parse({
          kind: "photo",
          productId: f.productId,
          expectedRevision: (await services.repository.snapshot(f.productId))
            .revision,
          slot,
          reason,
          evidenceReceiptId: receiptId,
          evidence: { note, urls: [], imageIds: [photo.imageId] },
        }),
      ),
    };
  };
  const accepted = async (slot: string) =>
    (await services.repository.snapshot(f.productId)).images.filter(
      (i) => i.slot === slot && i.state === "accepted",
    );
  return { f, services, users, proposePhoto, accepted };
}

it("fills an empty slot immediately and keeps one accepted photo per slot when a replacement is confirmed", async () => {
  const { f, services, users, proposePhoto, accepted } = await fixture();
  const first = await proposePhoto(users[0]!, "front", "jpeg");
  expect(await services.repository.proposal(first.result.id)).toMatchObject({
    status: "accepted",
    risk_tier: 1,
  });
  expect((await accepted("front")).map((i) => i.id)).toEqual([
    first.photo.imageId,
  ]);
  await expect(
    proposePhoto(users[1]!, "front", "png", "missing"),
  ).rejects.toMatchObject({ code: "PHOTO_REASON_REQUIRED" });
  const replacement = await proposePhoto(
    users[1]!,
    "front",
    "png",
    "outdated_packaging",
  );
  expect(
    await services.repository.proposal(replacement.result.id),
  ).toMatchObject({ status: "pending", risk_tier: 2 });
  // Proposed replacements stay non-canonical until accepted.
  expect((await accepted("front")).map((i) => i.id)).toEqual([
    first.photo.imageId,
  ]);
  const decisions = async () =>
    (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_decisions WHERE charged=1",
    ).first<number>("n"))!;
  const charged = await decisions();
  // The same photo from someone else becomes support, not a second proposal
  // or another model call.
  const repeat = await proposePhoto(
    users[2]!,
    "front",
    "png",
    "outdated_packaging",
  );
  expect(repeat.result).toMatchObject({
    id: replacement.result.id,
    duplicateOf: true,
  });
  expect(await decisions()).toBe(charged);
  expect(
    await services.repository.proposal(replacement.result.id),
  ).toMatchObject({ confirm_count: 1 });
  expect(
    (await services.moderation.sweepProposals()).length,
  ).toBeGreaterThanOrEqual(1);
  expect((await accepted("front")).map((i) => i.id)).toEqual([
    replacement.photo.imageId,
  ]);
  // The earlier photo is archived with its formula, not deleted.
  expect(
    (await services.repository.snapshot(f.productId)).images.find(
      (i) => i.id === first.photo.imageId,
    ),
  ).toMatchObject({ state: "archived", versionId: f.versionId });
});

it("keeps evidence-photo replacements with operators, retains legible derivatives and refuses mismatched photos", async () => {
  const { services, users, proposePhoto, accepted } = await fixture();
  const ingredients = await proposePhoto(users[0]!, "ingredients", "png");
  expect(
    await services.repository.proposal(ingredients.result.id),
  ).toMatchObject({ status: "accepted", risk_tier: 1 });
  const derivatives = (await env.DB.prepare(
    "SELECT evidence_r2_key,evidence_width FROM product_images WHERE id=?",
  )
    .bind(ingredients.photo.imageId)
    .first<{ evidence_r2_key: string | null; evidence_width: number }>())!;
  expect(derivatives.evidence_r2_key).toBeTruthy();
  expect(derivatives.evidence_width).toBeLessThanOrEqual(2400);
  const replacement = await proposePhoto(
    users[1]!,
    "ingredients",
    "jpeg",
    "blurry",
  );
  for (const user of users.slice(2, 5))
    await services.contributions.respond(user, id(), replacement.result.id, {
      stance: "confirm",
    });
  expect(
    await services.moderation.autoAccept(replacement.result.id),
  ).toMatchObject({ applied: false, reason: "protected" });
  expect((await accepted("ingredients")).map((i) => i.id)).toEqual([
    ingredients.photo.imageId,
  ]);
  await expect(
    proposePhoto(
      users[3]!,
      "back",
      "webp",
      "missing",
      "Back of the package [fake:matches_product=NO]",
    ),
  ).rejects.toMatchObject({ code: "PROPOSAL_NEEDS_CHANGES" });
  expect(await accepted("back")).toEqual([]);
});
