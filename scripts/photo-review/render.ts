import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { type Batch, result, runFile } from "./batch";
import { folderName, movedPhotos } from "./move-log";
import { AISLES, SLOTS } from "./schema";
import { foodName, loadRun, reviewLineIds, type ProductView } from "./view";

// `render`: the review sheet the owner checks (review.html), grouped by
// recipe line, plus import-shaped spreadsheet copies (products.csv for the
// in-scope products, out-of-scope.csv for the rest).

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;
const csv = (columns: string[], rows: (string | undefined)[][]) =>
  [
    columns.join(","),
    ...rows.map((row) =>
      row.map((value) => `"${(value ?? "").replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n") + "\n";
const LABEL_TEXT = {
  vegan: "Vegan",
  plant_based: "Plant-based",
  appears_plant_based: "Appears plant-based",
} as const;

export async function render(batch: Batch) {
  const run = await loadRun(batch);
  const { views, setAside, unaccounted, repeats } = run;
  const moved = await movedPhotos(batch);
  const url = (photo: string, size: "full" | "thumbnail") =>
    `../${[...(moved.get(photo)?.split("/") ?? []), size, photo].map(encodeURIComponent).join("/")}`;
  const image = (photo: string | undefined, caption: string) =>
    photo
      ? `<a class="shot" href="${url(photo, "full")}" target="_blank"><img src="${url(photo, "thumbnail")}" alt="${escape(caption)}" loading="lazy"><span>${escape(caption)}</span></a>`
      : "";
  const field = (label: string, value?: string) =>
    value ? `<dt>${label}</dt><dd>${escape(value)}</dd>` : "";
  const title = (view: ProductView) =>
    `${view.brand} · ${view.name}${view.flavor && !view.name.includes(view.flavor) ? ` · ${view.flavor}` : ""}`;

  const active = views.filter((view) => !view.skip);
  const inScope = active.filter((view) => !view.outOfScope);
  const outOfScope = active.filter((view) => view.outOfScope);
  const lineIds = reviewLineIds(active);
  const lineIdOf = (view: ProductView) => lineIds.get(view.id)!;
  // Links go only to products the page shows as cards.
  const productOf = new Map<string, ProductView>();
  for (const view of inScope)
    for (const photo of [
      ...Object.values(view.photos),
      ...view.record.other,
      ...Object.values(view.record.alternates).flat(),
    ])
      productOf.set(photo, view);
  // Where an out-of-scope product's photos are now, or will go.
  const outFolder = (view: ProductView) =>
    moved.get(view.photos.front ?? Object.values(view.photos)[0] ?? "") ??
    `out-of-scope/${folderName(view.outOfScope!)}`;

  // Lines as they stand after corrections: one original, distinct flavors.
  const lineKey = (view: ProductView) =>
    view.food || view.newFood
      ? `${view.brand}\u0000${view.lineName ?? view.name}\u0000${view.food ?? `new:${view.newFood!.name}`}\u0000${lineIdOf(view)}`
      : "\u0001unplaced";
  const newFoodAisle = (food: NonNullable<ProductView["newFood"]>) =>
    food.aisle
      ? (AISLES.get(food.aisle) ?? food.aisle)
      : `new aisle "${food.newAisle}"`;
  const foodLabel = (food: string, members: ProductView[]) =>
    food.startsWith("new:")
      ? `Suggested new food: ${food.slice(4)} (${newFoodAisle(members[0]!.newFood!)})`
      : foodName(food);
  const lineGroups = new Map<string, ProductView[]>();
  for (const view of inScope)
    lineGroups.set(lineKey(view), [
      ...(lineGroups.get(lineKey(view)) ?? []),
      view,
    ]);
  for (const [key, members] of lineGroups) {
    if (key === "\u0001unplaced") continue;
    const flavors = members.map((view) => view.flavor?.toLowerCase() ?? "");
    for (const view of members)
      if (
        flavors.filter(
          (flavor) => flavor === (view.flavor?.toLowerCase() ?? ""),
        ).length > 1
      )
        view.flags.push(
          view.flavor
            ? `flavor "${view.flavor}" appears twice in this line`
            : "two products are this line's original",
        );
  }
  const attention = inScope.filter((view) => view.flags.length);

  const card = (
    view: ProductView,
  ) => `<article id="${escape(view.id)}"${view.flags.length ? ' class="attention"' : ""}>
<h4>${escape(view.flavor ?? "Original")} <span class="badge ${view.label}">${LABEL_TEXT[view.label]}</span>${view.risk ? ` <span class="badge risk-${view.risk.level}">${view.risk.level} risk</span>` : ""} <span class="small">${escape(view.name)}</span></h4>
${view.flags.length ? `<ul class="flags">${view.flags.map((flag) => `<li>${escape(flag)}</li>`).join("")}</ul>` : ""}
<div class="shots">${SLOTS.map((slot) => image(view.photos[slot], slot)).join("")}${view.record.other.map((photo) => image(photo, "other")).join("")}</div>
<dl>${field("Package says", view.labelEvidence ? `${LABEL_TEXT[view.label]} — ${view.labelEvidence}` : LABEL_TEXT[view.label])}${field("Risk", view.risk ? `${view.risk.level}: ${view.risk.reason}` : undefined)}${field("Ingredient check", view.check ? `${view.check.result.replace(/_/g, " ")}${view.check.animalIngredients.length ? `: ${view.check.animalIngredients.join(", ")}` : ""}${view.check.notes ? ` — ${view.check.notes}` : ""}` : undefined)}${field("Sizes", view.sizes.join(", "))}${field("Stores", view.stores.join(", "))}${field("Catalog", view.catalog)}${field("Notes", [...view.record.notes, ...(view.correction?.note ? [view.correction.note] : [])].join(" "))}</dl>
</article>`;

  const lineSections = [...lineGroups]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, members]) => {
      const sorted = members.sort((a, b) =>
        (a.flavor ?? "").localeCompare(b.flavor ?? ""),
      );
      if (key === "\u0001unplaced")
        return `<section class="line"><h3>Not placed in a line yet (${members.length})</h3>${sorted.map(card).join("\n")}</section>`;
      const [brand, lineName, food] = key.split("\u0000") as [
        string,
        string,
        string,
      ];
      return `<section class="line" id="line-${escape(lineIdOf(sorted[0]!))}"><h3>${escape(brand)} · ${escape(lineName)}</h3><p class="small">${escape(foodLabel(food, members))} · ${plural(members.length, "product")}: ${escape(sorted.map((view) => view.flavor ?? "Original").join(", "))}</p>${sorted.map(card).join("\n")}</section>`;
    });

  const outByFood = new Map<string, ProductView[]>();
  for (const view of outOfScope)
    outByFood.set(view.outOfScope!, [
      ...(outByFood.get(view.outOfScope!) ?? []),
      view,
    ]);
  const outSection = [...outByFood]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(
      ([food, members]) =>
        `<h3>${escape(food)} (${members.length}) <span class="small">→ ${escape(outFolder(members[0]!))}/</span></h3><div class="shots">${members
          .sort((a, b) => title(a).localeCompare(title(b)))
          .map((view) =>
            image(
              view.photos.front ?? Object.values(view.photos)[0],
              title(view),
            ),
          )
          .join(
            "",
          )}</div>${[...new Set(members.map((view) => view.outOfScopeReason).filter(Boolean))].map((reason) => `<p class="small">${escape(reason!)}</p>`).join("")}`,
    )
    .join("");

  const reasons = [...new Set(setAside.map((entry) => entry.reason))];
  const setAsideSection = reasons
    .map((reason) => {
      const entries = setAside.filter((entry) => entry.reason === reason);
      return `<h3>${escape(reason)} (${entries.length})</h3><div class="shots">${entries
        .map((entry) => {
          const kept = entry.duplicateOf
            ? productOf.get(entry.duplicateOf)
            : undefined;
          return `<div class="pair">${image(entry.photo, "set aside")}${entry.duplicateOf ? image(entry.duplicateOf, "kept") : ""}${kept ? `<a class="small" href="#${escape(kept.id)}">${escape(title(kept))}</a>` : ""}${entry.note ? `<span class="small">${escape(entry.note)}</span>` : ""}</div>`;
        })
        .join("")}</div>`;
    })
    .join("");

  const listed = (
    members: readonly ProductView[],
    note: (view: ProductView) => string,
  ) =>
    `<ul>${members.map((view) => `<li><a href="#${escape(view.id)}">${escape(title(view))}</a> — ${escape(note(view))}</li>`).join("")}</ul>`;
  // Risk levels are information, not to-dos: only high-risk products were
  // checked, and only a check that found something is a flag.
  const riskCounts = ["high", "medium", "low"]
    .map(
      (level) =>
        [
          level,
          inScope.filter((view) => view.risk?.level === level).length,
        ] as const,
    )
    .filter(([, count]) => count);
  const highRisk = inScope.filter((view) => view.risk?.level === "high");
  const checkedClean = highRisk.filter(
    (view) => view.check?.result === "none_found",
  ).length;
  const inCatalog = inScope.filter(
    (view) =>
      view.catalog.startsWith("existing") ||
      view.catalog.startsWith("possible duplicate") ||
      view.catalog.startsWith("catalog check failed"),
  );
  // Plant-based alternatives no site food fits yet, by the food to add.
  const suggestedFoods = new Map<string, ProductView[]>();
  for (const view of inScope.filter((candidate) => candidate.newFood))
    suggestedFoods.set(view.newFood!.name, [
      ...(suggestedFoods.get(view.newFood!.name) ?? []),
      view,
    ]);
  const suggestedSection = [...suggestedFoods]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(
      ([food, members]) =>
        `<h3>${escape(food)} (${members.length}) <span class="small">${escape(newFoodAisle(members[0]!.newFood!))}</span></h3>${listed(members, (view) => view.newFood!.reason)}`,
    )
    .join("");
  const merged = inScope.filter((view) => view.record.cluster.length > 1);
  const labels = new Map<string, number>();
  for (const view of inScope)
    labels.set(view.label, (labels.get(view.label) ?? 0) + 1);
  const visitRows = run.visits
    .map(
      (visit) =>
        `<tr><td>${visit.visit}</td><td>#${visit.first}–#${visit.last} (${visit.photos})</td><td>${escape(visit.start?.slice(0, 16).replace("T", " ") ?? "")} UTC</td><td>${escape(run.stores[String(visit.visit)] ?? "not chosen yet")}</td><td>${escape(visit.proposals.map((p) => `${p.store} ×${p.count}: ${p.evidence.join("; ")}`).join(" · ") || "no evidence")}</td></tr>`,
    )
    .join("");
  const lineCount = [...lineGroups.keys()].filter(
    (key) => key !== "\u0001unplaced",
  ).length;

  const shown = new Map<string, string>();
  const reused: string[] = [];
  for (const view of active)
    for (const photo of Object.values(view.photos)) {
      if (shown.has(photo))
        reused.push(`${photo} is shown by ${shown.get(photo)} and ${view.id}`);
      shown.set(photo, view.id);
    }
  const problems = [
    ...run.problems,
    ...(unaccounted.length
      ? [`${plural(unaccounted.length, "photo")} not accounted for`]
      : []),
    ...inScope
      .filter((view) => !view.photos.front)
      .map((view) => `${view.id} has no front photo`),
    ...reused,
  ];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo batch review</title>
<style>
:root{color-scheme:light dark;--bg:#fafaf7;--card:#fff;--text:#1b1b1b;--muted:#666;--line:#ddd;--flag:#fff4d6;--flag-text:#7a4b00;--group:#f1efe8;--vegan:#d8f0dc;--vegan-text:#1d5c2a;--plant:#e3eefb;--plant-text:#1d3f6b;--appears:#f3e9d2;--appears-text:#6b4a12;--high:#fbd9d6;--high-text:#8a1f15}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--card:#202020;--text:#eee;--muted:#aaa;--line:#333;--flag:#3a2e12;--flag-text:#ffd27a;--group:#1b1b1b;--vegan:#173a20;--vegan-text:#a8e6b4;--plant:#162a42;--plant-text:#a9cdf5;--appears:#3a2e12;--appears-text:#ffd27a;--high:#4a1a16;--high-text:#ffb3aa}}
body{margin:0;padding:24px 16px;font:15px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--text)}
main{max-width:1100px;margin:auto}h1{margin:0 0 4px}p.summary{color:var(--muted);margin:0 0 20px}
article,section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px}
section.line{background:var(--group)}section.line article{margin:12px 0 0}
article.attention{border-left:4px solid var(--flag-text)}h2{font-size:19px;margin:0 0 10px}h3{font-size:17px;margin:0 0 4px}h4{font-size:15px;margin:0 0 8px}
.badge{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:1px 8px;margin-left:4px}
.badge.vegan{background:var(--vegan);color:var(--vegan-text)}.badge.plant_based{background:var(--plant);color:var(--plant-text)}.badge.appears_plant_based{background:var(--appears);color:var(--appears-text)}
.badge.risk-high{background:var(--high);color:var(--high-text)}.badge.risk-medium,.badge.risk-low{background:var(--flag);color:var(--flag-text)}
.flags{background:var(--flag);color:var(--flag-text);border-radius:6px;margin:0 0 12px;padding:8px 8px 8px 28px}
.shots{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.shot{display:flex;flex-direction:column;align-items:center;color:var(--muted);font-size:12px;text-decoration:none;max-width:150px;text-align:center}
.shot img{width:150px;height:200px;object-fit:contain;background:#000;border-radius:6px}.pair{display:flex;gap:4px;align-items:flex-end;flex-wrap:wrap;max-width:330px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0 0 8px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.small{font-size:12px;color:var(--muted);font-weight:normal}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
@media (max-width:640px){.table{overflow-x:auto}}
</style></head><body><main>
<h1>Photo batch review</h1>
<p class="summary">${escape(basename(batch.web))} · ${plural(inScope.length, "product")} in ${plural(lineCount, "line")} (${["vegan", "plant_based", "appears_plant_based"].map((label) => `${labels.get(label) ?? 0} ${LABEL_TEXT[label as keyof typeof LABEL_TEXT].toLowerCase()}`).join(", ")}) · ${plural(outOfScope.length, "product")} out of scope · ${plural(setAside.length, "photo")} set aside · ${plural(unaccounted.length, "photo")} not accounted for · ${attention.length} need a look${repeats.length ? ` · ${repeats.length} already in an earlier batch` : ""}</p>
${problems.length ? `<section class="flags"><h2>Problems (${problems.length})</h2><ul>${problems.map((problem) => `<li>${escape(problem)}</li>`).join("")}</ul></section>` : ""}
${riskCounts.length ? `<p class="summary">Appears plant-based, by risk: ${riskCounts.map(([level, count]) => `${count} ${level}`).join(", ")}. Only high-risk products were checked: ${checkedClean} of ${highRisk.length} showed no animal ingredients. Medium and low risk are shown on each product and not checked.</p>` : ""}
${
  attention.length
    ? `<section><h2>Needs a look (${attention.length})</h2>${listed(attention, (view) => view.flags.join(" · "))}</section>`
    : ""
}
${suggestedFoods.size ? `<section><h2>Suggested new foods (${suggestedFoods.size})</h2><p class="small">Plant-based alternatives no site food fits yet. Add the food (and its aisle) to the site, or move the line to an existing food with a correction.</p>${suggestedSection}</section>` : ""}
${inCatalog.length ? `<section><h2>Possibly already on the site (${inCatalog.length})</h2><p class="small">Checked against the catalog with the Add a product form's duplicate rules. Decide whether each is the listed product or a new one.</p>${listed(inCatalog, (view) => view.catalog)}</section>` : ""}
<section><h2>Visits and stores</h2><div class="table"><table><tr><th>Visit</th><th>Photos</th><th>Start</th><th>Store</th><th>Evidence</th></tr>${visitRows}</table></div></section>
<section><h2>Lines (${lineCount})</h2><p class="small">One brand's base recipe in one food (or a suggested new food), with its flavors. Vegan and plant-based packages are trusted; "appears plant-based" ones carry a risk level, and high-risk ones had their ingredient photo checked.</p></section>
${lineSections.join("\n")}
${outOfScope.length ? `<section><h2>Out of scope (${outOfScope.length})</h2><p class="small">These replace no animal product, so they aren't swaps. Their photos go to the out-of-scope folder for your review.</p>${outSection}</section>` : ""}
${repeats.length ? `<section><h2>Already in an earlier batch (${repeats.length})</h2><p class="small">Photographed again; the earlier batch keeps the product, and these photos are set aside as duplicates.</p><ul>${repeats.map(({ view, repeat }) => `<li>${escape(title(view))} → ${escape(basename(repeat.earlierWeb))}: ${escape(`${repeat.earlierBrand} · ${repeat.earlierName}`)}</li>`).join("")}</ul></section>` : ""}
${merged.length ? `<section><h2>Merged duplicates (${merged.length})</h2><ul>${merged.map((view) => `<li><a href="#${escape(view.id)}">${escape(title(view))}</a>: ${view.record.cluster.length} photo groups</li>`).join("")}</ul></section>` : ""}
${setAside.length ? `<section><h2>Set aside (${setAside.length})</h2><p class="small">Nothing has moved yet. These photos move to the set-aside folder only after you approve this list.</p>${setAsideSection}</section>` : ""}
${unaccounted.length ? `<section><h2>Not accounted for (${unaccounted.length})</h2><div class="shots">${unaccounted.map((photo) => image(photo, "unsorted")).join("")}</div></section>` : ""}
${
  views.some((view) => view.skip)
    ? `<section><h2>Skipped by you</h2><ul>${views
        .filter((view) => view.skip)
        .map((view) => `<li>${escape(title(view))}</li>`)
        .join("")}</ul></section>`
    : ""
}
</main></body></html>
`;

  await writeFile(runFile(batch, "review.html"), html);
  await writeFile(
    runFile(batch, "products.csv"),
    csv(
      [
        "id",
        "line_id",
        "needs_a_look",
        "catalog",
        "country",
        "brand",
        "line_name",
        "flavor",
        "name",
        "sizes",
        "food",
        "new_food",
        "new_food_aisle",
        "stores",
        "package_label",
        "label_evidence",
        "manufacturer_label",
        "risk",
        "risk_reason",
        "ingredient_check",
        "animal_ingredients",
        "front_photo",
        "ingredients_photo",
        "nutrition_photo",
        "back_photo",
        "other_photos",
        "visits",
      ],
      inScope.map((view) => [
        view.id,
        lineIdOf(view),
        view.flags.join("; "),
        view.catalog,
        "US",
        view.brand,
        view.lineName,
        view.flavor,
        view.name,
        view.sizes.join("; "),
        view.food,
        view.newFood?.name,
        view.newFood
          ? (view.newFood.aisle ?? `new: ${view.newFood.newAisle}`)
          : undefined,
        view.stores.join("; "),
        view.label,
        view.labelEvidence,
        view.manufacturerLabel,
        view.risk?.level,
        view.risk?.reason,
        view.check?.result,
        view.check?.animalIngredients.join("; "),
        view.photos.front,
        view.photos.ingredients,
        view.photos.nutrition,
        view.photos.back,
        view.record.other.join("; "),
        view.record.visits.join("; "),
      ]),
    ),
  );
  await writeFile(
    runFile(batch, "out-of-scope.csv"),
    csv(
      [
        "id",
        "line_id",
        "suggested_food",
        "reason",
        "brand",
        "line_name",
        "flavor",
        "name",
        "sizes",
        "package_label",
        "front_photo",
        "folder",
      ],
      outOfScope.map((view) => [
        view.id,
        lineIdOf(view),
        view.outOfScope,
        view.outOfScopeReason,
        view.brand,
        view.lineName,
        view.flavor,
        view.name,
        view.sizes.join("; "),
        view.label,
        view.photos.front,
        outFolder(view),
      ]),
    ),
  );

  for (const problem of problems) console.log(`Problem: ${problem}`);
  console.log(
    `${plural(inScope.length, "product")} in ${plural(lineCount, "line")}, ${outOfScope.length} out of scope, ${attention.length} need a look, ${plural(setAside.length, "photo")} set aside, ${plural(unaccounted.length, "photo")} not accounted for.\n${runFile(batch, "review.html")}`,
  );
  result({
    ok: true,
    products: inScope.length,
    lines: lineCount,
    outOfScope: outOfScope.length,
    attention: attention.length,
    setAside: setAside.length,
    unaccounted: unaccounted.length,
    problems,
  });
}
