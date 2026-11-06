import { productPath } from "@server/catalog/domain/markets";
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
  NO_NOTE,
  useCommunityAction,
  communityRequest,
  type CommunityOptions,
  friendly,
  reportReasonLabel,
} from "../lib/community";
import { PhotoProposalForm } from "../components/photo-proposal-form";
import { ProductEditSummary } from "../components/product-edit-summary";
import { shrinkPhoto } from "../lib/shrink-photo";
import { slotLabel } from "../components/photo-slots";
import { t } from "../i18n";
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
    { title: t("contribute.metaTitle") },
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
const changeLabels = () => ({
  ...factLabels(),
  classification: t("contribute.kindClassification"),
  reformulation: t("contribute.kindReformulation"),
  packaging: t("contribute.kindPackaging"),
  discontinue: t("contribute.kindDiscontinue"),
  reintroduce: t("contribute.kindReintroduce"),
  relationships: t("contribute.kindRelationships"),
  retailer_status: t("contribute.kindRetailerStatus"),
  allergens: t("contribute.kindAllergens"),
});
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
  const labels = changeLabels();
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
    [reportImage, setReportImage] = useState(image ?? ""),
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
      if (
        reportImage &&
        !product.images.some((photo) => photo.id === reportImage)
      )
        throw new Error(t("contribute.choosePhoto"));
      const saved = await action.request<{ id: string }>("reports", {
        targetType: reportImage ? "product_image" : "product",
        targetId: reportImage || product.id,
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
          `${productPath(product.countryCode, product.slug)}#retailers`,
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
            photo.set("image", await shrinkPhoto(files[slot]!));
            const result = await action.request<{ imageId: string }>(
              `submissions/${evidenceReceiptId}/uploads`,
              photo,
              `${uploadKey.current}_${slot}`,
            );
            uploaded.current.set(slot, result.imageId);
          }
      }
      const evidence = {
        note: String(form.get("note") ?? "") || NO_NOTE,
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
      if (administrator) {
        // Applied at once, so a retry starts fresh against the new revision.
        await action.request(
          "proposals/apply",
          { ...base, ...details },
          crypto.randomUUID(),
        );
        await navigate(`/admin/moderation/products/${product.id}`);
        return;
      }
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
              to: productPath(product.countryCode, product.slug),
            },
            { label: t("contribute.breadcrumb") },
          ]}
        />
        <header className="page-heading">
          <p className="eyebrow">{t("contribute.eyebrow")}</p>
          <h1>{product.name}</h1>
          <p>
            {administrator ? t("contribute.introAdmin") : t("contribute.intro")}
          </p>
          <GuidelinesNote />
        </header>
        <nav
          className="contribution-tabs"
          aria-label={t("contribute.typeLabel")}
        >
          {[
            [
              "change",
              administrator
                ? t("contribute.editProduct")
                : t("contribute.suggestChange"),
            ],
            ["photo", t("contribute.tabPhotos")],
            ["report", t("contribute.tabReport")],
            ["retailer", t("contribute.tabRetailer")],
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
                administrator={administrator}
              />
              {unchecked && labelPhotos.length > 0 && (
                <p className="small">
                  {t("contribute.photoUnchecked")}{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setKind("classification");
                      setTab("change");
                    }}
                  >
                    {t("contribute.checkIngredients")}
                  </button>
                </p>
              )}
            </>
          )}
          {tab === "report" && (
            <form className="community-form" onSubmit={saveReport}>
              <h2>{t("contribute.reportTitle")}</h2>
              <label htmlFor="report-target">
                {t("contribute.reportTarget")}
              </label>
              <select
                id="report-target"
                name="reportTarget"
                value={reportImage}
                onChange={(event) => setReportImage(event.target.value)}
              >
                <option value="">{t("contribute.productInfo")}</option>
                {product.images.map((photo) => (
                  <option key={photo.id} value={photo.id}>
                    {t("contribute.photoOption", {
                      slot: slotLabel(photo.slot as ImageSlot),
                    })}
                    {photo.versionId !== product.versionId
                      ? ` ${t("contribute.earlierFormula")}`
                      : ""}
                    {photo.state === "archived"
                      ? ` ${t("contribute.replaced")}`
                      : ""}
                  </option>
                ))}
              </select>
              {reportImage && (
                <img
                  className="upload-preview"
                  src={`/media/${reportImage}/thumbnail`}
                  alt={t("contribute.reportedPhotoAlt")}
                />
              )}
              <label htmlFor="reason">{t("contribute.reason")}</label>
              <select
                id="reason"
                name="reason"
                key={reportImage ? "product_image" : "product"}
              >
                {reportReasons[reportImage ? "product_image" : "product"].map(
                  (reason) => (
                    <option key={reason} value={reason}>
                      {reportReasonLabel(reason)}
                    </option>
                  ),
                )}
              </select>
              <EvidenceFields required={false} />
              {!reportImage && (
                <p className="small muted">{t("contribute.reportHint")}</p>
              )}
              <p className="small muted">{t("contribute.reportNote")}</p>
              <button className="button" disabled={action.busy}>
                {t("contribute.submitReport")}
              </button>
            </form>
          )}
          {tab === "retailer" && (
            <>
              <h2>{t("contribute.foundAt")}</h2>
              <p>{t("contribute.foundAtIntro", { country: countryName })}</p>
              <div className="button-row">
                <button
                  className="button secondary"
                  aria-pressed={!newRetailer}
                  onClick={() => setNewRetailer(false)}
                >
                  {t("contribute.chooseRetailer")}
                </button>
                <button
                  className="button secondary"
                  aria-pressed={newRetailer}
                  onClick={() => setNewRetailer(true)}
                >
                  {t("contribute.proposeRetailer")}
                </button>
              </div>
              <form
                className="community-form"
                key={String(newRetailer)}
                onSubmit={saveRetailer}
              >
                {newRetailer ? (
                  <>
                    <label htmlFor="retailer-name">
                      {t("contribute.retailerName")}
                    </label>
                    <input
                      id="retailer-name"
                      name="retailerName"
                      required
                      minLength={2}
                      maxLength={160}
                    />
                    <label htmlFor="retailer-url">
                      {t("contribute.retailerSite")}
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
                      {t("common.aliasesLabel")}
                    </label>
                    <input
                      id="retailer-aliases"
                      name="aliases"
                      maxLength={1000}
                    />
                    <label htmlFor="retailer-note">
                      {t("contribute.retailerWhy")}
                    </label>
                    <textarea
                      id="retailer-note"
                      name="note"
                      minLength={8}
                      maxLength={2000}
                      required
                    />
                    <p className="small muted">
                      {t("contribute.retailerCheck")}
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="retailer-search">
                      {t("contribute.findRetailer")}
                    </label>
                    <input
                      id="retailer-search"
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("contribute.searchPlaceholder")}
                    />
                    <label htmlFor="retailer">
                      {t("contribute.canonicalRetailer")}
                    </label>
                    <select
                      id="retailer"
                      name="retailer"
                      required
                      defaultValue=""
                    >
                      <option value="">{t("contribute.selectRetailer")}</option>
                      {retailers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="stance">{t("contribute.experience")}</label>
                    <select id="stance" name="stance">
                      <option value="confirm">
                        {t("contribute.seenHere")}
                      </option>
                      <option value="not_current">
                        {t("contribute.notCurrent")}
                      </option>
                    </select>
                    <p className="small muted">{t("contribute.stanceNote")}</p>
                  </>
                )}
                <button className="button" disabled={action.busy}>
                  {newRetailer
                    ? t("contribute.submitRetailer")
                    : t("contribute.saveAvailability")}
                </button>
              </form>
            </>
          )}
          {tab === "change" && (
            <form className="community-form" onSubmit={saveChange}>
              <h2>
                {administrator
                  ? t("contribute.editProduct")
                  : t("contribute.suggestChange")}
              </h2>
              {administrator && (
                <p className="notice">{t("contribute.adminNotice")}</p>
              )}
              {administrator && (
                <ProductEditSummary
                  product={product}
                  categoryNames={product.categoryNames}
                  onChange={(next) => {
                    setKind(next);
                    requestAnimationFrame(() =>
                      document.getElementById("change-kind")?.focus(),
                    );
                  }}
                />
              )}
              <label htmlFor="change-kind">
                {administrator
                  ? t("contribute.whatToChange")
                  : t("contribute.whatChanged")}
              </label>
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
                      ? t("contribute.checkIngredients")
                      : labels[k]}
                  </option>
                ))}
              </select>
              {kind === "classification" && unchecked && (
                <p className="notice">{t("safety.uncheckedChoose")}</p>
              )}
              {kind === "reformulation" && (
                <p className="notice">{t("contribute.noticeReformulation")}</p>
              )}
              {kind === "packaging" && (
                <p className="notice">{t("contribute.noticePackaging")}</p>
              )}
              {kind === "discontinue" && (
                <p className="notice">{t("contribute.noticeDiscontinue")}</p>
              )}
              {kind === "reintroduce" && (
                <label className="checkbox-label">
                  <input type="checkbox" name="sameFormula" />
                  {t("contribute.sameFormula")}
                </label>
              )}
              {(kind === "reformulation" || kind === "reintroduce") && (
                <>
                  <label htmlFor="version-label">
                    {t("contribute.formulaLabel")}
                  </label>
                  <input
                    id="version-label"
                    name="versionLabel"
                    required
                    minLength={2}
                    maxLength={160}
                    placeholder={t("contribute.formulaPlaceholder")}
                  />
                  <label htmlFor="effective-date">
                    {t("contribute.effectiveDate")}
                  </label>
                  <input
                    id="effective-date"
                    name="effectiveDate"
                    pattern="[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?"
                    placeholder={t("contribute.datePlaceholder")}
                  />
                  <p className="small muted">{t("contribute.precision")}</p>
                </>
              )}
              {["classification", "reformulation", "reintroduce"].includes(
                kind,
              ) && (
                <>
                  <label htmlFor="vegan-status">
                    {t("contribute.proposedClassification")}
                  </label>
                  <select
                    id="vegan-status"
                    name="veganStatus"
                    defaultValue={product.veganStatus}
                  >
                    <option value="appears_plant_based">
                      {t("safety.optAppearsPlantBased")}
                    </option>
                    <option value="vegan">{t("safety.optVegan")}</option>
                    <option value="plant_based">
                      {t("safety.optPlantBased")}
                    </option>
                    <option value="under_review">
                      {t("safety.optUnderReview")}
                    </option>
                  </select>
                  <ManufacturerField value={product.manufacturerLabel} />
                  {kind === "classification" &&
                    unchecked &&
                    (labelPhotos.length ? (
                      <fieldset>
                        <legend>{t("contribute.photoChecked")}</legend>
                        {labelPhotos.map((photo, index) => (
                          <label className="checkbox-label" key={photo.id}>
                            <input
                              type="radio"
                              name="citedImageId"
                              value={photo.id}
                              defaultChecked={index === 0}
                            />
                            {photo.slot === "ingredients"
                              ? t("community.slotIngredients")
                              : t("contribute.nutritionAllergensPhoto")}
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <p className="small muted">
                        {t("contribute.noIngredientsPhoto")}{" "}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setTab("photo")}
                        >
                          {t("contribute.addOneFirst")}
                        </button>{" "}
                        {t("contribute.addOneAfter")}
                      </p>
                    ))}
                  <fieldset>
                    <legend>{t("contribute.certification")}</legend>
                    <label htmlFor="certification-name">
                      {t("contribute.certificationName")}
                    </label>
                    <input
                      id="certification-name"
                      name="certificationName"
                      maxLength={160}
                    />
                    <label htmlFor="certification-url">
                      {t("contribute.certificationUrl")}
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
                  <label htmlFor="change-family">
                    {t("contribute.recipeLine")}
                  </label>
                  <select
                    id="change-family"
                    name="family"
                    defaultValue={product.familyId ?? ""}
                  >
                    {/* A discontinued product's line isn't listed; keep it
                    chosen so submitting never proposes a move. */}
                    {!lines.some(
                      (line) => line.lineId === product.familyId,
                    ) && (
                      <option value={product.familyId ?? ""}>
                        {t("contribute.itsLineNow", {
                          name: product.lineName ?? product.name,
                        })}
                      </option>
                    )}
                    {lines.map((line) => (
                      <option key={line.lineId} value={line.lineId}>
                        {t("contribute.lineFlavors", {
                          name: line.name,
                          count: line.flavors.length,
                        })}
                      </option>
                    ))}
                  </select>
                  <p className="small muted">{t("contribute.lineNote")}</p>
                  <CatalogSelect
                    id="change-related"
                    name="related"
                    label={t("contribute.relatedProduct")}
                    kind="products"
                    options={options.products}
                    excludeId={product.id}
                  />
                  <label htmlFor="change-relation">
                    {t("contribute.relationship")}
                  </label>
                  <select id="change-relation" name="relationship">
                    <option value="companion">
                      {t("contribute.companion")}
                    </option>
                    <option value="successor">
                      {t("contribute.successor")}
                    </option>
                  </select>
                  <fieldset>
                    <legend>{t("contribute.rankedFor")}</legend>
                    {product.categories.map((c) => (
                      <label className="checkbox-label" key={c.categoryId}>
                        <input
                          type="checkbox"
                          name={`category-${c.categoryId}`}
                          defaultChecked={c.eligible}
                        />
                        {product.categoryNames[c.categoryId] ?? c.categoryId}
                      </label>
                    ))}
                    <p className="small muted">{t("contribute.rankedNote")}</p>
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
                  country={product.countryCode.toUpperCase()}
                  countryName={countryName}
                  currentBrandId={product.brandId}
                  lineName={product.lineName ?? product.name}
                  existing={product.categories
                    .filter((c) => kind !== "foods" || c.eligible)
                    .map((c) => c.categoryId)}
                />
              )}
              {kind === "allergens" && <AllergenFields product={product} />}
              {kind === "retailer_status" && (
                <>
                  <label htmlFor="change-retailer">
                    {t("contribute.relationship")}
                  </label>
                  <select id="change-retailer" name="retailer" required>
                    <option value="">{t("contribute.chooseRetailer")}</option>
                    {product.retailers.map((r) => (
                      <option key={r.retailerId} value={r.retailerId}>
                        {options.retailers.find(
                          (option) => option.id === r.retailerId,
                        )?.name ?? r.retailerId}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="retailer-status">
                    {t("contribute.proposedStatus")}
                  </label>
                  <select id="retailer-status" name="status">
                    <option value="not_current">
                      {t("contribute.statusNotCurrent")}
                    </option>
                    <option value="uncertain">
                      {t("contribute.statusUncertain")}
                    </option>
                    <option value="active">
                      {t("contribute.statusActive")}
                    </option>
                  </select>
                </>
              )}
              <EvidenceFields
                noteLabel={
                  administrator ? t("contribute.reasonForChange") : undefined
                }
                required={!administrator}
                reviewed={!administrator}
              />
              {[
                "classification",
                "reformulation",
                "reintroduce",
                "packaging",
                "rename",
              ].includes(kind) && (
                <fieldset disabled={!!receiptId}>
                  <legend>{t("contribute.supportingPhotos")}</legend>
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
                  <p className="small muted">{t("contribute.photoLimits")}</p>
                </fieldset>
              )}
              <button className="button" disabled={action.busy}>
                {action.busy
                  ? t("contribute.saving")
                  : administrator
                    ? t("contribute.saveChange")
                    : t("contribute.submitProposal")}
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
                  {t("contribute.revisePhotos")}
                </button>
              )}
              {administrator && (
                <p>
                  <Link to={`/admin/moderation/products/${product.id}`}>
                    {t("contribute.history")}
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
