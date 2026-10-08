import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { ClefDecisionProvider } from "../server/moderation/infrastructure/clef-provider";
import {
  MODEL_TIER,
  questionsFor,
  type DecisionImage,
  type DecisionKind,
  type Outcome,
} from "../server/moderation/domain/decisions";
import {
  DEFAULT_MODERATION_POLICY,
  evaluatePolicy,
  type PolicyContext,
} from "../server/moderation/domain/policy";

// Calibrates provisional thresholds against a small labeled set of synthetic
// cases. It calls the real Workers AI models and is billed, so it requires an
// explicit flag. Only the AI binding is remote; nothing touches D1 or R2.
if (!process.argv.includes("--confirm-remote-spend"))
  throw new Error(
    "This script calls billed Workers AI models. Re-run with --confirm-remote-spend.",
  );

const svg = (body: string, background = "#f6f3e8") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900"><rect width="900" height="900" fill="${background}"/>${body}</svg>`;
const text = (
  x: number,
  y: number,
  size: number,
  value: string,
  weight = 400,
) =>
  `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="#1f2b20">${value}</text>`;
const front = (brand: string, name: string, color: string) =>
  svg(
    `<rect x="170" y="120" width="560" height="660" rx="36" fill="${color}"/><rect x="210" y="180" width="480" height="150" rx="16" fill="#fffaf0"/>${text(250, 245, 40, brand.toUpperCase(), 700)}${text(250, 300, 34, name, 700)}${text(250, 420, 30, "PLANT-BASED")}${text(250, 470, 26, "NET WT 12 OZ (340 g)")}<circle cx="450" cy="610" r="90" fill="#7a4a2b"/><circle cx="420" cy="590" r="20" fill="#9a6440"/>`,
  );
const ingredients = (lines: string[]) =>
  svg(
    `<rect x="80" y="100" width="740" height="700" fill="#ffffff" stroke="#222" stroke-width="4"/>${text(120, 170, 40, "INGREDIENTS:", 700)}${lines.map((l, i) => text(120, 230 + i * 48, 30, l)).join("")}${text(120, 700, 26, "CONTAINS: SOY.")}`,
    "#e9e5d8",
  );
const nutrition = svg(
  `<rect x="200" y="80" width="500" height="740" fill="#fff" stroke="#000" stroke-width="6"/>${text(225, 150, 52, "Nutrition Facts", 700)}${text(225, 210, 28, "4 servings per container")}${text(225, 260, 30, "Serving size 4 oz (113g)", 700)}<rect x="220" y="285" width="460" height="14" fill="#000"/>${text(225, 360, 40, "Calories 240", 700)}${["Total Fat 14g 18%", "Sodium 370mg 16%", "Total Carbohydrate 9g 3%", "Protein 19g"].map((l, i) => text(225, 440 + i * 70, 30, l)).join("")}`,
);
const unrelated = svg(
  `<rect x="0" y="560" width="900" height="340" fill="#4f7f3a"/><circle cx="700" cy="180" r="90" fill="#f2c94c"/><path d="M80 560 300 260 520 560Z" fill="#7b8a96"/><path d="M380 560 600 300 820 560Z" fill="#5d6b76"/>`,
  "#a8d4f0",
);

async function webp(markup: string): Promise<DecisionImage> {
  const bytes = new Uint8Array(
    await sharp(Buffer.from(markup)).webp({ quality: 85 }).toBuffer(),
  );
  return {
    contentHash: String(bytes.length),
    contentType: "image/webp",
    bytes,
  };
}

interface Case {
  name: string;
  kind: DecisionKind;
  expected: Outcome[];
  state: Record<string, unknown>;
  images?: DecisionImage[];
  context?: PolicyContext;
}
const orchardFront = await webp(
  front("Orchard Table", "Garden Crumbles", "#8fae6b"),
);
const otherFront = await webp(
  front("Sunny Fields", "Oat Milk Barista", "#9eb6d0"),
);
const orchardIngredients = await webp(
  ingredients([
    "Water, pea protein, coconut oil,",
    "rice protein, natural flavors,",
    "methylcellulose, beet juice color,",
    "salt, potato starch, apple extract.",
  ]),
);
const animalIngredients = await webp(
  ingredients([
    "Water, pea protein, coconut oil,",
    "whey protein concentrate (milk),",
    "egg whites, natural flavors,",
    "salt, potato starch.",
  ]),
);
const nutritionPanel = await webp(nutrition);
const landscape = await webp(unrelated);
const recent = [
  "The texture is close to ground beef once browned.",
  "Good in tacos but needs extra seasoning.",
];
const comment = (body: string) => ({
  product: {
    brand: "Orchard Table",
    name: "Garden Crumbles",
    category: "Ground Beef",
  },
  recentComments: recent,
  comment: { body },
});
const product = {
  brand: "Orchard Table",
  name: "Garden Crumbles",
  country: "US",
  categories: ["Ground Beef"],
  manufacturerLabel: "plant_based",
};
const cases: Case[] = [
  {
    name: "detailed opinion",
    kind: "comment",
    expected: ["READY"],
    state: comment(
      "Browns like real ground beef and holds together in tacos, but it needs more salt than I expected.",
    ),
  },
  {
    name: "short opinion",
    kind: "comment",
    expected: ["READY"],
    state: comment("Pretty good."),
  },
  {
    name: "negative opinion",
    kind: "comment",
    expected: ["READY"],
    state: comment(
      "Honestly tastes nothing like beef to me. Mushy and too sweet.",
    ),
  },
  {
    name: "discount spam",
    kind: "comment",
    expected: ["NEEDS_REVIEW", "BLOCKED"],
    state: comment(
      "Use code SAVE20 at cheap-vegan-deals.example for 20% off everything!!! Limited time, click now",
    ),
  },
  {
    name: "crypto spam",
    kind: "comment",
    expected: ["NEEDS_REVIEW", "BLOCKED"],
    state: comment(
      "Join my channel for daily crypto signals, 10x guaranteed, DM me",
    ),
  },
  {
    name: "off topic",
    kind: "comment",
    expected: ["NEEDS_REVIEW"],
    state: comment("Did anyone watch the game last night? Unreal finish."),
  },
  {
    name: "harassment",
    kind: "comment",
    expected: ["NEEDS_REVIEW", "BLOCKED"],
    state: comment(
      "Anyone who buys this is a pathetic idiot and should be ashamed.",
    ),
  },
  {
    name: "duplicate",
    kind: "comment",
    expected: ["NEEDS_REVIEW"],
    state: comment("The texture is close to ground beef once browned."),
  },
  {
    name: "matching submission",
    kind: "submission",
    expected: ["READY"],
    state: {
      product,
      images: [
        { position: 1, claimedSlot: "front" },
        { position: 2, claimedSlot: "ingredients" },
      ],
    },
    images: [orchardFront, orchardIngredients],
    context: { slots: ["front", "ingredients"], ingredientPhotoRequired: true },
  },
  {
    name: "different product front",
    kind: "submission",
    expected: ["NEEDS_CHANGES", "NEEDS_REVIEW"],
    state: {
      product,
      images: [
        { position: 1, claimedSlot: "front" },
        { position: 2, claimedSlot: "ingredients" },
      ],
    },
    images: [otherFront, orchardIngredients],
    context: { slots: ["front", "ingredients"], ingredientPhotoRequired: true },
  },
  {
    name: "front uploaded as ingredients",
    kind: "submission",
    expected: ["NEEDS_CHANGES", "NEEDS_REVIEW"],
    state: {
      product,
      images: [
        { position: 1, claimedSlot: "front" },
        { position: 2, claimedSlot: "ingredients" },
      ],
    },
    images: [orchardFront, orchardFront],
    context: { slots: ["front", "ingredients"], ingredientPhotoRequired: true },
  },
  {
    name: "unrelated photo",
    kind: "submission",
    expected: ["NEEDS_CHANGES", "NEEDS_REVIEW"],
    state: { product, images: [{ position: 1, claimedSlot: "front" }] },
    images: [landscape],
    context: { slots: ["front"] },
  },
  {
    name: "nutrition slot proposal",
    kind: "image",
    expected: ["READY", "NEEDS_REVIEW"],
    state: {
      product,
      claimedSlot: "nutrition",
      images: [{ position: 1, claimedSlot: "nutrition" }],
    },
    images: [nutritionPanel, orchardFront],
    context: { slots: ["nutrition"] },
  },
  {
    name: "wrong product front proposal",
    kind: "image",
    expected: ["NEEDS_CHANGES", "NEEDS_REVIEW"],
    state: {
      product,
      claimedSlot: "front",
      images: [{ position: 1, claimedSlot: "front" }],
    },
    images: [otherFront, orchardFront],
    context: { slots: ["front"] },
  },
  {
    name: "animal ingredient evidence",
    kind: "formula_evidence",
    expected: ["NEEDS_REVIEW"],
    state: {
      product,
      change: { kind: "classification", proposed: "under_review" },
    },
    images: [animalIngredients],
  },
  {
    name: "supported rename",
    kind: "edit_proposal",
    expected: ["READY", "NEEDS_REVIEW"],
    state: {
      product: { brand: "Orchard Table", name: "Crumbles" },
      change: { kind: "rename", name: "Garden Crumbles" },
      evidence: {
        note: "The current package front prints the full name.",
        urls: [],
      },
    },
    images: [orchardFront],
  },
  {
    name: "contradicted rename",
    kind: "edit_proposal",
    expected: ["NEEDS_CHANGES", "NEEDS_REVIEW"],
    state: {
      product: { brand: "Orchard Table", name: "Garden Crumbles" },
      change: { kind: "rename", name: "Smoky Bacon Bits" },
      evidence: { note: "The package front shows the new name.", urls: [] },
    },
    images: [orchardFront],
  },
  {
    name: "low-risk alias",
    kind: "edit_proposal",
    expected: ["READY"],
    state: {
      product: { brand: "Orchard Table", name: "Garden Crumbles" },
      change: { kind: "alias", alias: "veggie mince" },
      evidence: { note: "Shoppers call it veggie mince.", urls: [] },
    },
    context: { lowRisk: true },
  },
  {
    name: "food category",
    kind: "category_proposal",
    expected: ["NEEDS_REVIEW"],
    state: {
      proposal: {
        name: "Chorizo",
        parent: "Pork",
        explanation: "Spicy sausage alternatives are common now.",
        aliases: ["spanish sausage"],
      },
    },
  },
  {
    name: "non-food category",
    kind: "category_proposal",
    expected: ["NEEDS_CHANGES", "BLOCKED"],
    state: {
      proposal: {
        name: "Phone cases",
        explanation: "Best phone cases on sale",
        aliases: [],
      },
    },
  },
];

const source = parse(await readFile("wrangler.jsonc", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "veganalts-clef-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "veganalts-clef-calibration",
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      ai: { binding: "AI", remote: true },
    }),
  );
  const proxy = await getPlatformProxy<{
    AI: { run(model: string, input: unknown): Promise<unknown> };
  }>({
    configPath,
    remoteBindings: true,
  });
  try {
    const provider = new ClefDecisionProvider(proxy.env.AI);
    const results = [];
    let tokens = 0;
    for (const c of cases) {
      const images = c.images ?? [];
      const started = Date.now();
      const result = await provider.decide({
        tier: MODEL_TIER[c.kind],
        state: c.state,
        questions: questionsFor(c.kind, images.length),
        images,
      });
      const policy = evaluatePolicy(
        c.kind,
        result.answers,
        c.context ?? {},
        DEFAULT_MODERATION_POLICY,
      );
      tokens += result.usage.inputTokens;
      const row = {
        case: c.name,
        kind: c.kind,
        model: result.model,
        expected: c.expected,
        outcome: policy.outcome,
        match: c.expected.includes(policy.outcome),
        flags: policy.flags,
        latencyMs: Date.now() - started,
        inputTokens: result.usage.inputTokens,
        answers: Object.fromEntries(
          Object.entries(result.answers).map(([q, a]) => [
            q,
            Object.fromEntries(
              Object.entries(a.probabilities).map(([o, p]) => [
                o,
                Math.round(p * 1000) / 1000,
              ]),
            ),
          ]),
        ),
      };
      results.push(row);
      console.log(
        JSON.stringify({
          case: row.case,
          expected: row.expected,
          outcome: row.outcome,
          match: row.match,
          flags: row.flags,
          latencyMs: row.latencyMs,
        }),
      );
    }
    await mkdir("test-results/milestone-4", { recursive: true });
    await writeFile(
      "test-results/milestone-4/clef-calibration.json",
      JSON.stringify(
        { at: new Date().toISOString(), tokens, results },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        cases: results.length,
        matched: results.filter((r) => r.match).length,
        inputTokens: tokens,
      }),
    );
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
