import { env } from "cloudflare:workers";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { communityServices } from "@server/community/infrastructure/composition";
import {
  reportReasons,
  imageSlot,
  type ProductChange,
} from "@server/community/domain/contracts";
import type { ImageSlot } from "@server/media/domain/media";
import { SiteShell } from "../components/catalog";
import {
  FactChangeFields,
  factChangeDetails,
  factKinds,
  factLabels,
  isFactKind,
} from "../components/fact-change-fields";
import { CatalogSelect } from "../components/catalog-select";
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
    options: (await services.contributions.options(
      actor,
    )) as unknown as CommunityOptions,
    siteKey: env.TURNSTILE_SITE_KEY,
    initialAction: query.get("action") ?? "change",
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
] as const;
const labels = {
  ...factLabels,
  classification: "Classification evidence",
  reformulation: "Material reformulation",
  packaging: "Packaging update",
  discontinue: "Discontinued product",
  reintroduce: "Reintroduced product",
  relationships: "Family, variants and category eligibility",
  retailer_status: "Retailer availability concern",
};
export default function Contribute({
  loaderData: {
    product,
    options,
    siteKey,
    initialAction,
    image,
    administrator,
    initialSlot,
  },
}: Route.ComponentProps) {
  const [tab, setTab] = useState(initialAction),
    [kind, setKind] = useState<ProductChange["kind"]>("rename"),
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
        `community/options?q=${encodeURIComponent(query)}`,
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
            country: "US",
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
        await navigate(`/us/products/${product.slug}#retailers`);
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
          productFamilyId: form.get("family") || null,
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
      if (isFactKind(kind)) details = factChangeDetails(kind, form);
      const saved = await action.request<{ id: string }>("proposals", {
        ...base,
        ...details,
      });
      await navigate(`/my-contributions/proposal/${saved.id}`);
    });
  }
  return (
    <SiteShell compact>
      <CommunityControls>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to={`/us/products/${product.slug}`}>{product.name}</Link>
          <span>Contribute</span>
        </nav>
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
            <PhotoProposalForm
              product={product}
              initialSlot={initialSlot}
              action={action}
            />
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
                      {friendly(reason)}
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
                Share where this product is commonly sold in the United States.
                This does not indicate live inventory.
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
                    {labels[k]}
                  </option>
                ))}
              </select>
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
                  <CatalogSelect
                    id="change-family"
                    name="family"
                    label="Product family"
                    kind="families"
                    options={options.families}
                    defaultValue={product.familyId ?? ""}
                  />
                  <p className="small muted">
                    Families can connect country-specific products without
                    combining their ratings.
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
                    <option value="variant">Variant</option>
                    <option value="specialty_flavor">Specialty flavor</option>
                    <option value="companion">Companion</option>
                    <option value="successor">Successor</option>
                  </select>
                  <fieldset>
                    <legend>Eligible replacement categories</legend>
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
                      Exclude specialty flavors from base categories where they
                      would be misleading. Existing ratings remain preserved.
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
                  categories={options.categories}
                  existing={product.categories.map((c) => c.categoryId)}
                />
              )}
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
    </SiteShell>
  );
}
