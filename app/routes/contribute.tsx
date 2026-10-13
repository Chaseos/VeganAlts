import { env } from "cloudflare:workers";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { communityServices } from "@server/community/infrastructure/composition";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  reportReasons,
  imageSlot,
  type ProductChange,
} from "@server/community/domain/contracts";
import type { ImageSlot } from "@server/media/domain/media";
import { PageShell } from "../components/layout/page-shell";
import { Breadcrumb } from "../components/ui/navigation";
import {
  FactChangeFields,
  factChangeDetails,
  factKinds,
  factLabels,
  isFactKind,
} from "../components/fact-change-fields";
import { CatalogSelect } from "../components/catalog-select";
import { AllergenFields, allergenDetails } from "../components/allergen-fields";
import {
  CommunityControls,
  GuidelinesNote,
} from "../components/community-form";
import {
  CommunityFeedback,
  EvidenceFields,
  ManufacturerField,
  PhotoPicker,
} from "../components/community-form";
import {
  useCommunityAction,
  communityRequest,
  type CommunityOptions,
  friendly,
  reportReasonLabel,
} from "../lib/community";
import { PhotoProposalForm } from "../components/photo-proposal-form";
import type { Route } from "./+types/contribute";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env),
    services = communityServices(env);
  const product = await services.contributions.product(actor, params.productId),
    query = new URL(request.url).searchParams;
  const image = query.get("image");
  return {
    product,
    // The brand's lines here, for proposing another line (milestone 7).
    lines: product.brandId
      ? await services.submissions.brandLines(
          actor,
          product.brandId,
          product.countryCode.toUpperCase(),
          null,
        )
      : [],
    options: (await services.contributions.options(
      actor,
      "",
      product.countryCode.toUpperCase(),
    )) as unknown as CommunityOptions,
    countryName:
      (await catalogService(env).markets()).find(
        (row) => row.market.code === product.countryCode,
      )?.market.name ?? product.countryCode.toUpperCase(),
    siteKey: env.TURNSTILE_SITE_KEY,
    initialAction: query.get("action") ?? "change",
    // "Check the ingredients" opens the classification change directly.
    initialKind:
      query.get("kind") === "classification"
        ? ("classification" as const)
        : null,
    initialSlot: imageSlot.safeParse(query.get("slot")).data ?? "front",
    image: image && product.images.some((i) => i.id === image) ? image : null,
    administrator: actor.administrator,
  };
}
export function meta() {
  return [
    { title: "Contribute to the catalog · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const kinds = [
  ...factKinds,
  "classification",
  "reformulation",
  "packaging",
  "discontinue",
  "reintroduce",
  "relationships",
  "retailer_status",
  "allergens",
] as const;
const labels = {
  ...factLabels,
  classification: "Classification evidence",
  reformulation: "Material reformulation",
  packaging: "Packaging update",
  discontinue: "Discontinued product",
  reintroduce: "Reintroduced product",
  relationships: "Line, related products and which foods it’s ranked for",
  retailer_status: "Retailer availability concern",
  allergens: "Allergens on the label",
};
export default function Contribute({
  loaderData: {
    product,
    lines,
    countryName,
    options,
    siteKey,
    initialAction,
    image,
    administrator,
    initialSlot,
    initialKind,
  },
}: Route.ComponentProps) {
  // No one has confirmed this formula's ingredients yet (milestone 6).
  const unchecked = product.classification?.ingredientsChecked === false;
  // The current formula's accepted label photos a check can cite.
  const labelPhotos = product.images.filter(
    (i) =>
      i.versionId === product.versionId &&
      i.state === "accepted" &&
      (i.slot === "ingredients" || i.slot === "nutrition"),
  );
  const [tab, setTab] = useState(initialAction),
    [kind, setKind] = useState<ProductChange["kind"]>(initialKind ?? "rename"),
    [newRetailer, setNewRetailer] = useState(false),
    [query, setQuery] = useState(""),
    [retailers, setRetailers] = useState(options.retailers),
    [files, setFiles] = useState<Partial<Record<ImageSlot, File>>>({}),
    [receiptId, setReceiptId] = useState<string | null>(null);
  const uploaded = useRef(new Map<ImageSlot, string>()),
    uploadKey = useRef<string | null>(null),
    action = useCommunityAction(),
    navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void communityRequest<CommunityOptions>(
        `community/options?q=${encodeURIComponent(query)}&country=${product.countryCode}`,
      )
        .then((result) => {
          if (active) setRetailers(result.retailers);
        })
        .catch(() => {});
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      const saved = await action.request<{ id: string }>("reports", {
        targetType: image ? "product_image" : "product",
        targetId: image ?? product.id,
        reason: form.get("reason"),
        note: String(form.get("note") ?? ""),
        evidenceUrls: form.get("evidenceUrl") ? [form.get("evidenceUrl")] : [],
      });
      await navigate(`/my-contributions/report/${saved.id}`);
    });
  }
  async function saveRetailer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      if (newRetailer) {
        const saved = await action.request<{ id: string }>(
          "retailers/proposals",
          {
            name: form.get("retailerName"),
            websiteUrl: form.get("websiteUrl"),
            country: product.countryCode.toUpperCase(),
            aliases: String(form.get("aliases") ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            note: form.get("note"),
          },
        );
        await navigate(`/my-contributions/proposal/${saved.id}`);
      } else {
        await action.request("retailer-confirmations", {
          productId: product.id,
          retailerId: form.get("retailer"),
          stance: form.get("stance"),
        });
        await navigate(
          `/${product.countryCode}/products/${product.slug}#retailers`,
        );
      }
    });
  }
  async function saveChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      const slots = (Object.keys(files) as ImageSlot[]).filter(
        (slot) => files[slot],
      );
      let evidenceReceiptId = receiptId;
      if (slots.length) {
        uploadKey.current ??= crypto.randomUUID();
        if (!evidenceReceiptId) {
          const reserved = await action.request<{ receiptId: string }>(
            "submissions/evidence",
            { productId: product.id },
            uploadKey.current,
          );
          evidenceReceiptId = reserved.receiptId;
          setReceiptId(evidenceReceiptId);
        }
        for (const slot of slots)
          if (!uploaded.current.has(slot)) {
            const photo = new FormData();
            photo.set("slot", slot);
            photo.set("image", files[slot]!);
            const result = await action.request<{ imageId: string }>(
              `submissions/${evidenceReceiptId}/uploads`,
              photo,
              `${uploadKey.current}_${slot}`,
            );
            uploaded.current.set(slot, result.imageId);
          }
      }
      const evidence = {
        note: String(form.get("note")),
        urls: form.get("evidenceUrl") ? [String(form.get("evidenceUrl"))] : [],
        imageIds: [...uploaded.current.values()],
      };
      const base = {
        kind,
        productId: product.id,
        expectedRevision: product.revision,
        evidence,
        ...(evidenceReceiptId ? { evidenceReceiptId } : {}),
      };
      let details: Record<string, unknown> = {};
      if (["classification", "reformulation", "reintroduce"].includes(kind))
        details = {
          veganStatus: form.get("veganStatus"),
          manufacturerLabel: form.get("manufacturerLabel"),
          ...(kind === "classification" && form.get("citedImageId")
            ? { citedImageId: form.get("citedImageId") }
            : {}),
          certifications: form.get("certificationName")
            ? [
                {
                  name: form.get("certificationName"),
                  sourceUrl: form.get("certificationUrl"),
                },
              ]
            : [],
        };
      if (kind === "reformulation" || kind === "reintroduce")
        details = {
          ...details,
          versionLabel: form.get("versionLabel"),
          ...(form.get("effectiveDate")
            ? { effectiveDate: form.get("effectiveDate") }
            : {}),
        };
      if (kind === "reintroduce")
        details.sameFormula = form.get("sameFormula") === "on";
      if (kind === "relationships") {
        const related = String(form.get("related") ?? "");
        details = {
          // The current line keeps it where it is.
          productFamilyId:
            form.get("family") && form.get("family") !== product.familyId
              ? form.get("family")
              : null,
          ...(related
            ? {
                relatedProductId: related,
                relationship: form.get("relationship"),
              }
            : {}),
          categoryEligibility: product.categories.map((c) => ({
            categoryId: c.categoryId,
            eligible: form.get(`category-${c.categoryId}`) === "on",
          })),
        };
      }
      if (kind === "retailer_status")
        details = {
          retailerId: form.get("retailer"),
          status: form.get("status"),
        };
      if (kind === "allergens") details = allergenDetails(form);
      if (isFactKind(kind)) details = factChangeDetails(kind, form);
      const saved = await action.request<{ id: string }>("proposals", {
        ...base,
        ...details,
      });
      await navigate(`/my-contributions/proposal/${saved.id}`);
    });
  }
  return (
    <PageShell width="narrow">
      <CommunityControls>
        <Breadcrumb
          items={[
            {
              label: product.name,
              to: `/${product.countryCode}/products/${product.slug}`,
            },
            { label: "Contribute" },
          ]}
        />
        <header className="page-heading">
          <p className="eyebrow">Keep the catalog useful</p>
          <h1>{product.name}</h1>
          <p>
            Your evidence helps an operator make an informed decision. Existing
            ratings remain with their original formula.
          </p>
          <GuidelinesNote />
        </header>
        <nav className="contribution-tabs" aria-label="Contribution type">
          {[
            ["change", "Suggest a change"],
            ["photo", "Photos"],
            ["report", "Report a concern"],
            ["retailer", "Retailer availability"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value!)}
            >
              {label}
            </button>
          ))}
        </nav>
        <section className="community-panel">
          {tab === "photo" && (
            <>
              <PhotoProposalForm
                product={product}
                initialSlot={initialSlot}
                action={action}
              />
              {unchecked && labelPhotos.length > 0 && (
                <p className="small">
                  The ingredients photo is here but no one has checked it yet.{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setKind("classification");
                      setTab("change");
                    }}
                  >
                    Check the ingredients
                  </button>
                </p>
              )}
            </>
          )}
          {tab === "report" && (
            <form className="community-form" onSubmit={saveReport}>
              <h2>{image ? "Report this photo" : "Report this product"}</h2>
              {image && (
                <img
                  className="upload-preview"
                  src={`/media/${image}/thumbnail`}
                  alt="Photo being reported"
                />
              )}
              <label htmlFor="reason">Reason</label>
              <select id="reason" name="reason">
                {reportReasons[image ? "product_image" : "product"].map(
                  (reason) => (
                    <option key={reason} value={reason}>
                      {reportReasonLabel(reason)}
                    </option>
                  ),
                )}
              </select>
              <EvidenceFields required={false} />
              <p className="small muted">
                Ingredient concerns receive priority. A report does not change
                product facts until an operator assesses it. Repeated reports
                update your evidence and count once.
              </p>
              <button className="button" disabled={action.busy}>
                Submit report
              </button>
            </form>
          )}
          {tab === "retailer" && (
            <>
              <h2>Commonly found at</h2>
              <p>
                Share where this product is commonly sold in {countryName}. This
                does not indicate live inventory.
              </p>
              <div className="button-row">
                <button
                  className="button secondary"
                  aria-pressed={!newRetailer}
                  onClick={() => setNewRetailer(false)}
                >
                  Choose a retailer
                </button>
                <button
                  className="button secondary"
                  aria-pressed={newRetailer}
                  onClick={() => setNewRetailer(true)}
                >
                  Propose a retailer
                </button>
              </div>
              <form
                className="community-form"
                key={String(newRetailer)}
                onSubmit={saveRetailer}
              >
                {newRetailer ? (
                  <>
                    <label htmlFor="retailer-name">Retailer name</label>
                    <input
                      id="retailer-name"
                      name="retailerName"
                      required
                      minLength={2}
                      maxLength={160}
                    />
                    <label htmlFor="retailer-url">
                      Official retailer website
                    </label>
                    <input
                      id="retailer-url"
                      name="websiteUrl"
                      type="url"
                      required
                      maxLength={1000}
                      placeholder="https://"
                    />
                    <label htmlFor="retailer-aliases">
                      Other names (optional, separated by commas)
                    </label>
                    <input
                      id="retailer-aliases"
                      name="aliases"
                      maxLength={1000}
                    />
                    <label htmlFor="retailer-note">
                      Why should this retailer be added?
                    </label>
                    <textarea
                      id="retailer-note"
                      name="note"
                      minLength={8}
                      maxLength={2000}
                      required
                    />
                    <p className="small muted">
                      An operator checks its identity and country before it
                      becomes selectable.
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="retailer-search">Find a retailer</label>
                    <input
                      id="retailer-search"
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search names and aliases"
                    />
                    <label htmlFor="retailer">Canonical retailer</label>
                    <select
                      id="retailer"
                      name="retailer"
                      required
                      defaultValue=""
                    >
                      <option value="">Select a retailer</option>
                      {retailers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="stance">Your experience</label>
                    <select id="stance" name="stance">
                      <option value="confirm">I have seen it sold here</option>
                      <option value="not_current">
                        I believe this relationship is no longer current
                      </option>
                    </select>
                    <p className="small muted">
                      One current stance is kept per person. Confirming again
                      refreshes its date; it does not increase your weight. An
                      operator decides whether to remove a relationship.
                    </p>
                  </>
                )}
                <button className="button" disabled={action.busy}>
                  {newRetailer
                    ? "Submit retailer proposal"
                    : "Save availability"}
                </button>
              </form>
            </>
          )}
          {tab === "change" && (
            <form className="community-form" onSubmit={saveChange}>
              <h2>Suggest a change</h2>
              <label htmlFor="change-kind">What changed?</label>
              <select
                id="change-kind"
                value={kind}
                disabled={!!receiptId}
                onChange={(e) =>
                  setKind(e.target.value as ProductChange["kind"])
                }
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k === "classification" && unchecked
                      ? "Check the ingredients"
                      : labels[k]}
                  </option>
                ))}
              </select>
              {kind === "classification" && unchecked && (
                <p className="notice">
                  Ingredients not checked yet. Choose the ingredients photo you
                  checked and what it shows. Another member confirms it, and any
                  disagreement goes to a moderator.
                </p>
              )}
              {kind === "reformulation" && (
                <p className="notice">
                  A material ingredient or formula change starts a new current
                  formula. Previous ratings, comments and evidence stay in
                  history.
                </p>
              )}
              {kind === "packaging" && (
                <p className="notice">
                  Packaging-only changes keep the same formula and ratings.
                  Attach a photo of the updated packaging.
                </p>
              )}
              {kind === "discontinue" && (
                <p className="notice">
                  Accepted discontinuation removes active discovery and ranking
                  eligibility. The product and formula history stay readable.
                </p>
              )}
              {kind === "reintroduce" && (
                <label className="checkbox-label">
                  <input type="checkbox" name="sameFormula" />
                  Evidence establishes that this is the same formula as before.
                  Explain the equivalence below.
                </label>
              )}
              {(kind === "reformulation" || kind === "reintroduce") && (
                <>
                  <label htmlFor="version-label">Formula label</label>
                  <input
                    id="version-label"
                    name="versionLabel"
                    required
                    minLength={2}
                    maxLength={160}
                    placeholder="e.g. 2026 recipe"
                  />
                  <label htmlFor="effective-date">
                    Approximate effective date (optional)
                  </label>
                  <input
                    id="effective-date"
                    name="effectiveDate"
                    pattern="[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?"
                    placeholder="2026, 2026-09, or 2026-09-15"
                  />
                  <p className="small muted">
                    Use only the precision supported by your evidence.
                  </p>
                </>
              )}
              {["classification", "reformulation", "reintroduce"].includes(
                kind,
              ) && (
                <>
                  <label htmlFor="vegan-status">
                    Proposed platform classification
                  </label>
                  <select
                    id="vegan-status"
                    name="veganStatus"
                    defaultValue={product.veganStatus}
                  >
                    <option value="appears_vegan">Appears vegan</option>
                    <option value="vegan">
                      Vegan — requires operator verification
                    </option>
                    <option value="plant_based">Plant-based</option>
                    <option value="under_review">
                      Under review — ingredient concern
                    </option>
                  </select>
                  <ManufacturerField value={product.manufacturerLabel} />
                  {kind === "classification" &&
                    unchecked &&
                    (labelPhotos.length ? (
                      <fieldset>
                        <legend>The photo you checked</legend>
                        {labelPhotos.map((photo, index) => (
                          <label className="checkbox-label" key={photo.id}>
                            <input
                              type="radio"
                              name="citedImageId"
                              value={photo.id}
                              defaultChecked={index === 0}
                            />
                            {photo.slot === "ingredients"
                              ? "Ingredients photo"
                              : "Nutrition and allergens photo"}
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <p className="small muted">
                        This product has no ingredients photo yet.{" "}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setTab("photo")}
                        >
                          Add one first
                        </button>{" "}
                        so another member can confirm your check; without it a
                        moderator reviews it.
                      </p>
                    ))}
                  <fieldset>
                    <legend>Third-party certification (optional)</legend>
                    <label htmlFor="certification-name">
                      Certification name
                    </label>
                    <input
                      id="certification-name"
                      name="certificationName"
                      maxLength={160}
                    />
                    <label htmlFor="certification-url">
                      Certification evidence URL
                    </label>
                    <input
                      id="certification-url"
                      name="certificationUrl"
                      type="url"
                      maxLength={1000}
                      placeholder="https://"
                    />
                  </fieldset>
                </>
              )}
              {kind === "relationships" && (
                <>
                  <label htmlFor="change-family">Recipe line</label>
                  <select
                    id="change-family"
                    name="family"
                    defaultValue={product.familyId ?? ""}
                  >
                    {lines.map((line) => (
                      <option key={line.lineId} value={line.lineId}>
                        {line.name} ({line.flavors.length}{" "}
                        {line.flavors.length === 1 ? "flavor" : "flavors"})
                      </option>
                    ))}
                  </select>
                  <p className="small muted">
                    Flavors of one base recipe share a line and one ranking. An
                    operator reviews a move to another line.
                  </p>
                  <CatalogSelect
                    id="change-related"
                    name="related"
                    label="Related product (optional)"
                    kind="products"
                    options={options.products}
                    excludeId={product.id}
                  />
                  <label htmlFor="change-relation">Relationship</label>
                  <select id="change-relation" name="relationship">
                    <option value="companion">Companion</option>
                    <option value="successor">Successor</option>
                  </select>
                  <fieldset>
                    <legend>Ranked for these foods</legend>
                    {product.categories.map((c) => (
                      <label className="checkbox-label" key={c.categoryId}>
                        <input
                          type="checkbox"
                          name={`category-${c.categoryId}`}
                          defaultChecked={c.eligible}
                        />
                        {options.categories.find(
                          (option) => option.id === c.categoryId,
                        )?.name ?? c.categoryId}
                      </label>
                    ))}
                    <p className="small muted">
                      Leave a flavor out of foods where ranking it would
                      mislead. Existing ratings are kept.
                    </p>
                  </fieldset>
                </>
              )}
              {isFactKind(kind) && (
                <FactChangeFields
                  // Remount per kind so one kind's typed or prefilled value
                  // never carries into another kind's field.
                  key={kind}
                  kind={kind}
                  currentName={product.name}
                  currentFlavor={product.flavor}
                  seasonal={product.seasonal}
                  categories={options.categories}
                  existing={product.categories.map((c) => c.categoryId)}
                />
              )}
              {kind === "allergens" && <AllergenFields product={product} />}
              {kind === "retailer_status" && (
                <>
                  <label htmlFor="change-retailer">Relationship</label>
                  <select id="change-retailer" name="retailer" required>
                    <option value="">Choose a retailer</option>
                    {product.retailers.map((r) => (
                      <option key={r.retailerId} value={r.retailerId}>
                        {options.retailers.find(
                          (option) => option.id === r.retailerId,
                        )?.name ?? r.retailerId}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="retailer-status">Proposed status</label>
                  <select id="retailer-status" name="status">
                    <option value="not_current">No longer current</option>
                    <option value="uncertain">Uncertain</option>
                    <option value="active">Active</option>
                  </select>
                </>
              )}
              <EvidenceFields />
              {[
                "classification",
                "reformulation",
                "reintroduce",
                "packaging",
                "rename",
              ].includes(kind) && (
                <fieldset disabled={!!receiptId}>
                  <legend>Supporting photos</legend>
                  {(["front", "ingredients"] as const).map((slot) => (
                    <PhotoPicker
                      slot={slot}
                      key={slot}
                      file={files[slot]}
                      onChange={(file) =>
                        setFiles((old) => ({ ...old, [slot]: file }))
                      }
                    />
                  ))}
                  <p className="small muted">
                    Up to 10 MiB per photo. While a proposal is open for
                    community confirmation, signed-in contributors can see its
                    evidence; otherwise it stays private during review.
                  </p>
                </fieldset>
              )}
              <button className="button" disabled={action.busy}>
                {action.busy
                  ? "Saving evidence…"
                  : "Submit proposal for review"}
              </button>
              {receiptId && action.error && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={action.busy}
                  onClick={() => {
                    setReceiptId(null);
                    uploaded.current.clear();
                    uploadKey.current = null;
                    action.clearError();
                  }}
                >
                  Revise photos
                </button>
              )}
              {administrator && (
                <p>
                  <Link to={`/admin/moderation/products/${product.id}`}>
                    Operator history and reversals →
                  </Link>
                </p>
              )}
            </form>
          )}
          <CommunityFeedback action={action} siteKey={siteKey} />
        </section>
      </CommunityControls>
    </PageShell>
  );
}
