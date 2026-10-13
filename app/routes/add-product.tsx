import { env } from "cloudflare:workers";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { communityServices } from "@server/community/infrastructure/composition";
import { catalogService } from "@server/catalog/infrastructure/composition";
import type { Candidate } from "@server/community/domain/contracts";
import { PageShell } from "../components/layout/page-shell";
import { Notice } from "../components/ui/feedback";
import {
  CommunityControls,
  CommunityFeedback,
  GuidelinesNote,
} from "../components/community-form";
import {
  BASICS_FIELDS,
  BasicsStep,
} from "../components/add-product/basics-step";
import { MORE_FIELDS, MoreStep } from "../components/add-product/more-step";
import { ErrorSummary } from "../components/add-product/error-summary";
import { InReview } from "../components/add-product/in-review";
import { useSubmission } from "../components/add-product/use-submission";
import { useCommunityAction, type CommunityOptions } from "../lib/community";
import { PREFERENCE_KEYS, readPreference } from "../lib/device-preferences";
import { productPath } from "../lib/site-chrome";
import {
  clearDraftPhotos,
  pruneDraftPhotos,
  loadDraftPhotos,
  saveDraftPhoto,
} from "../lib/draft-photos";
import {
  basicsErrors,
  clearDraft,
  draftKey,
  editDraft,
  emptyDraft,
  extrasErrors,
  forCountry,
  fromSubmission,
  loadDraft,
  saveDraft,
  toSubmission,
  type DraftErrors,
  type PhotoSlot,
  type ProductDraft,
} from "../lib/product-draft";
import type { Route } from "./+types/add-product";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env);
  const services = communityServices(env);
  const query = new URL(request.url).searchParams;
  const followUpId = query.get("followUp");
  const followUp = followUpId
    ? await services.submissions.revisionSource(actor, followUpId)
    : null;
  // A product belongs to the country of the page it was added from.
  const catalog = catalogService(env);
  const markets = (await catalog.markets()).map((row) => row.market);
  const wanted = (followUp?.input.country ?? query.get("country") ?? "")
    .toLowerCase()
    .trim();
  const market =
    markets.find((m) => m.code === wanted) ??
    markets.find((m) => m.code === "us") ??
    markets[0]!;
  // "Add another flavor" links a product's line (`?line=`), and a brand page
  // links its brand (`?brand=`), milestone 7.
  const [choices, options, start] = await Promise.all([
    catalog.contributionChoices(market),
    services.contributions.options(actor, "", market.iso2),
    followUp
      ? { brand: null, line: null }
      : services.submissions.start(market.iso2, {
          line: query.get("line"),
          brand: query.get("brand"),
        }),
  ]);
  // A food page links here with its food chosen (`?food=`, or the older
  // `?category=` with the food's ID).
  const food = query.get("food"),
    category = query.get("category");
  // The Suggest a food page can hand over a new food with its aisle.
  const newFood = query.get("newFood")?.trim().slice(0, 160) ?? "";
  const aisle = query.get("aisle") ?? "";
  return {
    market,
    markets,
    foods: choices.foods,
    aisles: choices.aisles,
    allergens: choices.allergens,
    options: options as unknown as CommunityOptions,
    preselect:
      choices.foods.find((f) => f.slug === food || f.id === category)?.id ??
      null,
    start,
    suggested:
      newFood.length >= 2
        ? {
            name: newFood,
            aisleId: choices.aisles.some((a) => a.id === aisle) ? aisle : "",
          }
        : null,
    countryChosen: query.has("country") || Boolean(followUp),
    siteKey: env.TURNSTILE_SITE_KEY,
    followUp,
  };
}
export function meta() {
  return [
    { title: "Add a product · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

type Photos = Partial<Record<PhotoSlot, File>>;
const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Add a product (milestone 6): the basics, then optional details, then one
 * submit. Step 2 is `?step=more`, so Back returns to the basics. Milestone 7:
 * the basics run food, brand, what's listed from it, then the product.
 */
export default function AddProduct({ loaderData }: Route.ComponentProps) {
  const {
    market,
    markets,
    foods,
    aisles,
    allergens,
    options,
    preselect,
    suggested,
    start,
    countryChosen,
    siteKey,
    followUp,
  } = loaderData;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const step = params.get("step") === "more" ? "more" : "basics";
  const key = draftKey(followUp);
  const initial = () =>
    followUp
      ? fromSubmission(followUp.input, {
          submissionId: followUp.submissionId,
          expectedRevision: followUp.expectedRevision,
        })
      : emptyDraft(market.iso2, {
          food: suggested
            ? { kind: "new", ...suggested, otherNames: [] }
            : preselect
              ? { kind: "existing", id: preselect }
              : null,
          brand: start.brand,
          line: start.line,
        });
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [photos, setPhotos] = useState<Photos>({});
  // Photos come back from IndexedDB asynchronously after hydration.
  const [photosReady, setPhotosReady] = useState(false);
  const [restored, setRestored] = useState<ProductDraft | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shownErrors, setShownErrors] = useState<DraftErrors>({});
  const [exact, setExact] = useState<Candidate | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const action = useCommunityAction();
  const submission = useSubmission(action);
  const heading = useRef<HTMLHeadingElement>(null);
  const hydrated = useRef(false);
  // A saved draft offered for restoring stays saved until the choice. A ref,
  // because the autosave runs in the same flush that offers it.
  const offering = useRef(false);

  // After hydration: a saved draft (offered when it disagrees with the link
  // that opened the page) and, without a chosen country, the remembered one.
  useEffect(() => {
    if (hydrated.current) return;
    if (!countryChosen) {
      const saved = readPreference(PREFERENCE_KEYS.country);
      if (
        saved &&
        saved !== market.code &&
        markets.some((m) => m.code === saved)
      ) {
        // The page reloads its data for that country; this runs again then.
        void navigate(`?country=${saved}`, { replace: true });
        return;
      }
    }
    hydrated.current = true;
    // A follow-up reply restores only its own draft, for the same request.
    const stored = loadDraft(storage(), Date.now(), key);
    const saved =
      followUp &&
      (stored?.followUp?.submissionId !== followUp.submissionId ||
        stored.followUp.expectedRevision !== followUp.expectedRevision)
        ? null
        : stored;
    // A saved draft continues only where the link agrees with it: its food,
    // and the line or brand the link chose.
    const same =
      saved &&
      saved.country === market.iso2 &&
      !suggested &&
      (!preselect ||
        saved.startedFrom === preselect ||
        (saved.food?.kind === "existing" && saved.food.id === preselect)) &&
      (!start.line ||
        (saved.line?.kind === "flavor" &&
          saved.line.lineId === start.line.lineId)) &&
      (!start.brand || saved.brandId === start.brand.id);
    if (saved && same) {
      setDraft(saved);
      void loadDraftPhotos(saved.id).then((stored) => {
        setPhotos((picked) => ({ ...stored, ...picked }));
        setPhotosReady(true);
      });
      return;
    }
    if (saved) {
      offering.current = true;
      setRestored(saved);
    }
    // Without a draft here, only stale photos go; another tab's draft keeps
    // its own.
    else void pruneDraftPhotos();
    setPhotosReady(true);
  }, [
    countryChosen,
    followUp,
    market,
    markets,
    navigate,
    preselect,
    start,
    suggested,
  ]);
  // The country comes from the page, and so do its stores and allergen list.
  const offered = {
    retailerIds: options.retailers.map((r) => r.id),
    allergens: allergens.map((a) => a.key),
  };
  useEffect(() => {
    setDraft((d) =>
      d.country === market.iso2 ? d : forCountry(d, market.iso2, offered),
    );
    // The offered lists arrive with the country's loader data.
  }, [market.iso2]);
  useEffect(() => {
    if (hydrated.current && !held && !offering.current)
      saveDraft(storage(), draft, Date.now(), key);
  }, [draft, held, restored]);

  const update = useCallback(
    (patch: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  );
  const edit = useCallback(
    (patch: Parameters<typeof editDraft>[1]) =>
      setDraft((d) => editDraft(d, patch)),
    [],
  );
  const setPhoto = (slot: PhotoSlot, file: File | undefined) => {
    setPhotos((p) => ({ ...p, [slot]: file }));
    void saveDraftPhoto(draft.id, slot, file);
  };
  // Forgets the saved draft and its photos; another draft's photos (one set
  // aside, or another tab's) stay.
  const forget = (draftId = draft.id) => {
    clearDraft(storage(), key);
    void clearDraftPhotos(draftId);
  };
  const onExact = useCallback((match: Candidate | null) => setExact(match), []);
  const basics = (): DraftErrors => ({
    ...basicsErrors(draft, photos),
    ...(exact
      ? {
          duplicate:
            "This product is already on VeganAlts. Rate it instead, or change the name if it’s a different flavor or formula.",
        }
      : {}),
  });
  const focusHeading = () =>
    requestAnimationFrame(() => heading.current?.focus());
  const goTo = (next: "basics" | "more") => {
    const query = new URLSearchParams(params);
    if (next === "more") query.set("step", "more");
    else query.delete("step");
    setParams(query, { preventScrollReset: true });
    setShownErrors({});
    action.clearError();
    focusHeading();
  };
  // Live corrections once a step was attempted: fixed fields drop out. A
  // refusal from the server (a duplicate, a food name already taken) stays
  // until the next attempt, since nothing here can recheck it.
  const errors = attempt
    ? Object.fromEntries(
        Object.keys(shownErrors).map((field) => {
          const live = (step === "basics" ? basics() : extrasErrors(draft))[
            field as keyof DraftErrors
          ];
          return [
            field,
            field === "duplicate" ? (live ?? shownErrors.duplicate) : live,
          ];
        }),
      )
    : {};
  // Step 2 with missing basics (after a reload, photos are gone) returns to 1.
  useEffect(() => {
    if (!photosReady) return;
    if (step === "more" && Object.keys(basicsErrors(draft, photos)).length) {
      const query = new URLSearchParams(params);
      query.delete("step");
      setParams(query, { replace: true });
      setShownErrors(basicsErrors(draft, photos));
      setAttempt((n) => n + 1);
    }
    // Only when arriving on step 2, once saved photos are back.
  }, [step, photosReady]);

  const onContinue = () => {
    const found = basics();
    if (Object.keys(found).length) {
      setShownErrors(found);
      setAttempt((n) => n + 1);
      return;
    }
    goTo("more");
  };
  const onSubmit = async () => {
    const found = extrasErrors(draft);
    if (Object.keys(found).length) {
      setShownErrors(found);
      setAttempt((n) => n + 1);
      return;
    }
    const outcome = await submission.submit(
      toSubmission(draft, photos),
      photos,
    );
    if (!outcome) return;
    if (outcome.kind === "published") {
      forget();
      await navigate(productPath(market.code, outcome.slug), {
        // "Saved" only when the server confirms it, "follows" only when it
        // will be retried; a rating that can never count, or an unknown
        // outcome (a replayed publication), says neither.
        state: {
          added: true,
          rated: outcome.rating === "saved" ? draft.rating : null,
          ratingPending: outcome.rating === "pending",
        },
      });
    } else if (outcome.kind === "held") {
      forget();
      setHeld(outcome.receiptId);
      focusHeading();
    } else {
      // An exact duplicate was found after all: back to the basics.
      goTo("basics");
      setShownErrors({
        duplicate:
          outcome.reasons.join(" ") ||
          "This product is already on VeganAlts. Rate it instead.",
      });
      setAttempt((n) => n + 1);
    }
  };
  const startOver = () => {
    forget();
    setDraft(emptyDraft(market.iso2));
    setPhotos({});
    setHeld(null);
    offering.current = false;
    setRestored(null);
    goTo("basics");
  };
  const title = held
    ? "Thanks, your product is in review"
    : step === "basics"
      ? "The basics"
      : "Add more (optional)";
  return (
    <PageShell width="narrow" countryMenu={false}>
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">Grow the community catalog</p>
          <h1>Add a product</h1>
          <p>
            Tell us the basics first. Everything else is optional and can be
            added later by anyone.
          </p>
          <GuidelinesNote />
        </header>
        {followUp && (
          <aside className="community-panel" aria-label="Requested follow-up">
            <h2>Respond to the moderator</h2>
            <p>{followUp.note}</p>
            <p>
              Update the details and add the photos you want reviewed again.
              Your{" "}
              <Link
                to={`/my-contributions/submission/${followUp.submissionId}`}
              >
                original submission
              </Link>{" "}
              stays in your history, and this response returns to review.
            </p>
          </aside>
        )}
        {restored && (
          <Notice title="You have an unfinished product">
            <p>
              {restored.brand || restored.name
                ? `${[restored.brand, restored.name].filter(Boolean).join(" · ")} is saved on this device.`
                : "A product you started is saved on this device."}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button small-button"
                onClick={() => {
                  // A draft stays in its own country: the page follows it
                  // there, with that country's foods, stores and allergens.
                  setDraft(restored);
                  offering.current = false;
                  setRestored(null);
                  // Only that draft's photos: any picked meanwhile belong
                  // to the draft being set aside.
                  void loadDraftPhotos(restored.id).then(setPhotos);
                  if (restored.country !== market.iso2)
                    void navigate(
                      `?country=${restored.country.toLowerCase()}`,
                      { replace: true },
                    );
                }}
              >
                Continue it
              </button>
              <button
                type="button"
                className="button secondary small-button"
                onClick={() => {
                  forget(restored.id);
                  offering.current = false;
                  setRestored(null);
                }}
              >
                Start a new one
              </button>
            </div>
          </Notice>
        )}
        {!held && (
          <ol className="step-list" aria-label="Steps">
            <li aria-current={step === "basics" ? "step" : undefined}>
              1. The basics
            </li>
            <li aria-current={step === "more" ? "step" : undefined}>
              2. Add more (optional)
            </li>
          </ol>
        )}
        <section className="community-panel">
          <h2 tabIndex={-1} ref={heading}>
            {title}
          </h2>
          {held ? (
            <InReview
              receiptId={held}
              countryName={market.name}
              newFood={draft.food?.kind === "new" ? draft.food.name : null}
              hasRating={Boolean(draft.rating)}
              onAnother={startOver}
            />
          ) : (
            <>
              <ErrorSummary
                errors={errors}
                fieldIds={{ ...BASICS_FIELDS, ...MORE_FIELDS }}
                attempt={attempt}
              />
              {step === "basics" ? (
                <BasicsStep
                  draft={draft}
                  update={update}
                  edit={edit}
                  photos={photos}
                  setPhoto={setPhoto}
                  foods={foods}
                  aisles={aisles}
                  allowSuggest
                  countries={markets}
                  countryName={market.name}
                  errors={errors}
                  onExact={onExact}
                  onContinue={onContinue}
                  busy={action.busy}
                />
              ) : (
                <MoreStep
                  draft={draft}
                  update={update}
                  photos={photos}
                  setPhoto={setPhoto}
                  foods={foods}
                  countryName={market.name}
                  allergenList={allergens}
                  options={options}
                  errors={errors}
                  onEdit={() => goTo("basics")}
                  onSubmit={() => void onSubmit()}
                  busy={action.busy}
                  progress={submission.progress}
                />
              )}
            </>
          )}
          <CommunityFeedback action={action} siteKey={siteKey} />
        </section>
      </CommunityControls>
    </PageShell>
  );
}
