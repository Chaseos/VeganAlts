import { env } from "cloudflare:workers";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { communityServices } from "@server/community/infrastructure/composition";
import type {
  Candidate,
  SubmissionInput,
  SubmissionDecision,
} from "@server/community/domain/contracts";
import type { ImageSlot } from "@server/media/domain/media";
import { SiteShell } from "../components/catalog";
import {
  CommunityFeedback,
  CommunityControls,
  PhotoPicker,
  ManufacturerField,
} from "../components/community-form";
import {
  useCommunityAction,
  communityRequest,
  type CommunityOptions,
} from "../lib/community";
import { CatalogSelect } from "../components/catalog-select";
import type { Route } from "./+types/add-product";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env);
  const services = communityServices(env);
  const query = new URL(request.url).searchParams;
  const followUpId = query.get("followUp");
  return {
    options: (await services.contributions.options(
      actor,
    )) as unknown as CommunityOptions,
    siteKey: env.TURNSTILE_SITE_KEY,
    category: query.get("category"),
    followUp: followUpId
      ? await services.submissions.revisionSource(actor, followUpId)
      : null,
  };
}
export function meta() {
  return [
    { title: "Add a product · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default function AddProduct({
  loaderData: { options, siteKey, category, followUp },
}: Route.ComponentProps) {
  const [step, setStep] = useState(1),
    [name, setName] = useState(followUp?.input.name ?? ""),
    [brand, setBrand] = useState(followUp?.input.brand ?? ""),
    [categories, setCategories] = useState<string[]>(
      followUp?.input.categoryIds ?? (category ? [category] : []),
    ),
    [candidates, setCandidates] = useState<Candidate[]>([]);
  const [brandOptions, setBrandOptions] = useState(options.brands);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void communityRequest<CommunityOptions>(
        `community/options?q=${encodeURIComponent(brand)}`,
      )
        .then((value) => {
          if (active) setBrandOptions(value.brands);
        })
        .catch(() => {
          if (active) setBrandOptions(options.brands);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [brand, options.brands]);
  const [files, setFiles] = useState<Partial<Record<ImageSlot, File>>>({}),
    [ingredientUrl, setIngredientUrl] = useState(
      followUp?.input.ingredientUrl ?? "",
    ),
    [details, setDetails] = useState<SubmissionInput | null>(
      followUp?.input ?? null,
    ),
    [receipt, setReceipt] = useState<string | null>(null),
    [result, setResult] = useState<string | null>(null);
  const action = useCommunityAction(),
    navigate = useNavigate(),
    title = useRef<HTMLHeadingElement>(null),
    key = useRef<string | null>(null),
    uploaded = useRef(new Set<string>());
  const go = (n: number) => {
    action.clearError();
    setStep(n);
    requestAnimationFrame(() => title.current?.focus());
  };
  const identity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await action.run(async () => {
      const found = await action.request<Candidate[]>(
        "submissions/check-identity",
        { name, brand, country: "US", categoryIds: categories },
      );
      setCandidates(found);
      go(2);
    });
  };
  const evidence = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!files.front || (!files.ingredients && !ingredientUrl)) {
      void action.run(async () => {
        throw new Error(
          "Choose a front photo and add an ingredient-panel photo or manufacturer source.",
        );
      });
      return;
    }
    const related = String(form.get("related") ?? ""),
      family = String(form.get("family") ?? "");
    setDetails({
      name,
      brand,
      country: "US",
      categoryIds: categories,
      imageSlots: Object.keys(files).filter(
        (slot) => files[slot as ImageSlot],
      ) as ImageSlot[],
      ...(ingredientUrl ? { ingredientUrl } : {}),
      statusBasis: String(form.get("statusBasis")),
      noKnownAnimalIngredients: form.get("noAnimal") === "on",
      manufacturerLabel: String(
        form.get("manufacturerLabel"),
      ) as SubmissionInput["manufacturerLabel"],
      specialtyFlavor: form.get("specialty") === "on",
      ...(followUp
        ? {
            followUp: {
              submissionId: followUp.submissionId,
              expectedRevision: followUp.expectedRevision,
            },
          }
        : {}),
      ...(family ? { productFamilyId: family } : {}),
      ...(related
        ? {
            relatedProductId: related,
            relationship: String(
              form.get("relationship"),
            ) as SubmissionInput["relationship"],
          }
        : {}),
    });
    go(4);
  };
  const submit = () =>
    action.run(async () => {
      if (!details) return;
      key.current ??= crypto.randomUUID();
      let receiptId = receipt;
      if (!receiptId) {
        const checked = await action.request<
          SubmissionDecision & { receiptId: string | null; slug?: string }
        >("submissions/preflight", details, key.current);
        // A retried key may already have been published.
        if (checked.slug) {
          await navigate(`/us/products/${checked.slug}`);
          return;
        }
        if (checked.decision === "NEEDS_CHANGES" || !checked.receiptId) {
          setCandidates(checked.candidates);
          go(2);
          throw new Error(checked.reasons.join(" "));
        }
        receiptId = checked.receiptId;
        setReceipt(receiptId);
      }
      for (const slot of details.imageSlots)
        if (!uploaded.current.has(slot)) {
          const form = new FormData();
          form.set("slot", slot);
          form.set("image", files[slot]!);
          await action.request(
            `submissions/${receiptId}/uploads`,
            form,
            `${key.current}_${slot}`,
          );
          uploaded.current.add(slot);
        }
      const saved = await action.request<{
        decision: string;
        slug?: string;
        reasons?: string[];
      }>(`submissions/${receiptId}/finalize`, details, key.current);
      if (saved.decision === "READY" && saved.slug) {
        await navigate(`/us/products/${saved.slug}`);
        return;
      }
      if (saved.decision === "BLOCKED") {
        // A blocked receipt is closed; any revision starts a fresh submission.
        setReceipt(null);
        key.current = null;
        uploaded.current.clear();
        throw new Error(
          saved.reasons?.join(" ") || "This submission cannot be accepted.",
        );
      }
      if (saved.decision === "NEEDS_CHANGES")
        throw new Error(
          `${saved.reasons?.join(" ") ?? "Review the product details."} Choose “Revise submission” to replace the photos.`,
        );
      setResult(receiptId);
      go(5);
    });
  return (
    <SiteShell compact>
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">Grow the community catalog</p>
          <h1>Add a product</h1>
          <p>
            A clear package photo and ingredient evidence help everyone find a
            reliable alternative.
          </p>
        </header>
        {followUp && (
          <aside className="community-panel" aria-label="Requested follow-up">
            <h2>Respond to the operator</h2>
            <p>{followUp.note}</p>
            <p>
              Update the details and attach the photos you want reviewed. Your
              <Link
                to={`/my-contributions/submission/${followUp.submissionId}`}
              >
                {" "}
                original submission and evidence
              </Link>{" "}
              remain in your history. This response will return to manual
              review.
            </p>
          </aside>
        )}
        <ol className="step-list" aria-label="Submission progress">
          {["Identify", "Check matches", "Add evidence", "Review"].map(
            (label, i) => (
              <li
                key={label}
                aria-current={step === i + 1 ? "step" : undefined}
              >
                {i + 1}. {label}
              </li>
            ),
          )}
        </ol>
        <section className="community-panel">
          <h2 tabIndex={-1} ref={title}>
            {
              [
                "",
                "Identify your product",
                "Check existing products",
                "Show what’s on the package",
                "Review your submission",
                "Submitted for review",
              ][step]
            }
          </h2>
          {step === 1 && (
            <form className="community-form" onSubmit={identity}>
              <label htmlFor="product-name">Product name</label>
              <input
                id="product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={160}
              />
              <p className="small muted">
                Include the flavor or formula name. Package sizes share one
                product.
              </p>
              <label htmlFor="brand-name">Brand</label>
              <input
                id="brand-name"
                list="brand-options"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
                minLength={2}
                maxLength={160}
              />
              <datalist id="brand-options">
                {brandOptions.map((b) => (
                  <option key={b.id} value={b.name} />
                ))}
              </datalist>
              <p className="small muted">
                Select an existing brand when possible. A new brand is checked
                with your submission.
              </p>
              <label htmlFor="country">Country</label>
              <select id="country" value="US" disabled>
                <option value="US">United States</option>
              </select>
              <fieldset>
                <legend>What does it replace?</legend>
                <p className="small muted">
                  Choose up to five appropriate categories.
                </p>
                <div className="checkbox-grid">
                  {options.categories.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={categories.includes(c.id)}
                        onChange={(e) =>
                          setCategories(
                            e.target.checked
                              ? [...categories, c.id]
                              : categories.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className="button"
                disabled={
                  action.busy || !categories.length || categories.length > 5
                }
              >
                Check for matches →
              </button>
            </form>
          )}
          {step === 2 && (
            <>
              <p>
                {candidates.length
                  ? "These entries may already cover this product. Different package sizes use the same entry; distinct flavors and formulas stay separate."
                  : "No likely matches found. Continue with ingredient evidence."}
              </p>
              <ul className="candidate-list">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <Link to={`/us/products/${c.slug}`}>
                      {c.brand} · {c.name}
                    </Link>
                    <span>
                      {c.exact ? "Existing product" : "Related entry"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <button className="button secondary" onClick={() => go(1)}>
                  Edit details
                </button>
                {!candidates.some((c) => c.exact) && (
                  <button className="button" onClick={() => go(3)}>
                    {candidates.length
                      ? "This is a different product"
                      : "Add evidence →"}
                  </button>
                )}
              </div>
            </>
          )}
          {step === 3 && (
            <form className="community-form" onSubmit={evidence}>
              <p className="small muted">
                JPEG, PNG or WebP. Up to 10 MiB and 40 megapixels each; three
                photos total. Photos remain private until publication.
              </p>
              {(["front", "ingredients", "back"] as const).map((slot) => (
                <PhotoPicker
                  key={slot}
                  slot={slot}
                  file={files[slot]}
                  required={slot === "front"}
                  onChange={(file) =>
                    setFiles((old) => ({ ...old, [slot]: file }))
                  }
                />
              ))}
              <label htmlFor="ingredient-source">
                Manufacturer ingredient source{" "}
                {files.ingredients
                  ? "(optional)"
                  : "(required without ingredient photo)"}
              </label>
              <input
                id="ingredient-source"
                type="url"
                value={ingredientUrl}
                onChange={(e) => setIngredientUrl(e.target.value)}
                required={!files.ingredients}
                maxLength={1000}
                placeholder="https://"
              />
              <ManufacturerField value={details?.manufacturerLabel} />
              <label htmlFor="status-basis">
                What supports the ingredient classification?
              </label>
              <textarea
                id="status-basis"
                name="statusBasis"
                required
                minLength={8}
                maxLength={2000}
                rows={4}
                defaultValue={details?.statusBasis}
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="noAnimal"
                  defaultChecked={details?.noKnownAnimalIngredients ?? true}
                />
                I found no known animal-derived ingredients in this evidence.
              </label>
              <p className="small muted">
                Automatic publication uses a provisional classification. “Vegan”
                and certification claims require operator review.
              </p>
              <details>
                <summary>Variants and related products (optional)</summary>
                <CatalogSelect
                  id="product-family"
                  name="family"
                  label="Product family"
                  kind="families"
                  options={options.families}
                  defaultValue={details?.productFamilyId}
                />
                <CatalogSelect
                  id="related-product"
                  name="related"
                  label="Related product"
                  kind="products"
                  options={options.products}
                  defaultValue={details?.relatedProductId}
                />
                <label htmlFor="relationship">Relationship</label>
                <select
                  id="relationship"
                  name="relationship"
                  defaultValue={details?.relationship ?? "variant"}
                >
                  <option value="variant">Variant</option>
                  <option value="specialty_flavor">Specialty flavor</option>
                  <option value="companion">Companion</option>
                  <option value="successor">Successor</option>
                </select>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="specialty"
                    defaultChecked={details?.specialtyFlavor}
                  />
                  Specialty flavor: review category eligibility.
                </label>
              </details>
              <div className="button-row">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => go(2)}
                >
                  Back
                </button>
                <button className="button">Review submission →</button>
              </div>
            </form>
          )}
          {step === 4 && details && (
            <>
              <dl className="review-facts">
                <dt>Product</dt>
                <dd>
                  {brand} · {name}
                </dd>
                <dt>Country</dt>
                <dd>United States</dd>
                <dt>Replaces</dt>
                <dd>
                  {options.categories
                    .filter((c) => categories.includes(c.id))
                    .map((c) => c.name)
                    .join(", ")}
                </dd>
                <dt>Photos</dt>
                <dd>{details.imageSlots.join(", ")}</dd>
                <dt>Ingredient source</dt>
                <dd>{ingredientUrl || "Uploaded ingredient panel"}</dd>
                <dt>Evidence</dt>
                <dd>{details.statusBasis}</dd>
              </dl>
              <p>
                Clear submissions publish provisionally. Ambiguous identities,
                ingredient concerns, and relationships go to an operator for
                review.
              </p>
              {receipt && (
                <p role="status">
                  Submission saved. {uploaded.current.size} of{" "}
                  {details.imageSlots.length} photos processed. Retry resumes
                  this submission.
                </p>
              )}
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={action.busy}
                  onClick={() => {
                    setReceipt(null);
                    key.current = null;
                    uploaded.current.clear();
                    go(3);
                  }}
                >
                  {receipt ? "Revise submission" : "Edit evidence"}
                </button>
                <button
                  className="button"
                  disabled={
                    action.busy || (action.challenge && !action.hasToken)
                  }
                  onClick={() => void submit()}
                >
                  {action.busy
                    ? "Processing submission…"
                    : receipt
                      ? "Resume submission"
                      : "Submit product"}
                </button>
              </div>
            </>
          )}
          {step === 5 && result && (
            <>
              <p>
                Your evidence is private while an operator reviews the
                submission. You can check the outcome and any requested
                corrections in My contributions.
              </p>
              <Link
                className="button"
                to={`/my-contributions/submission/${result}`}
              >
                View submission receipt →
              </Link>
            </>
          )}
          <CommunityFeedback action={action} siteKey={siteKey} />
        </section>
      </CommunityControls>
    </SiteShell>
  );
}
