# VeganAlts Moderation & Community Editing v1.0

## 1. Goal

VeganAlts should accept community contributions at scale without requiring an administrator to approve every ordinary action.

The operating principle is:

> **Opinions publish quickly. Facts accumulate confidence. High-risk facts receive stronger protection.**

This model draws conceptually from large collaborative systems such as Google Maps, HappyCow, Wikipedia and OpenStreetMap without copying any one system exactly.

## 2. Distinguish opinion from canonical facts

### Opinions

Normally publish immediately after automated validation:

- similarity ratings;
- detailed ratings;
- comments;
- Tried state;
- comment usefulness votes.

### Canonical facts

May require confidence/proposal workflows:

- product name/brand;
- formula status;
- vegan status;
- category eligibility;
- discontinued status;
- canonical images;
- duplicate identity;
- retailer relationship when contested.

## 3. New product submissions

Adding a missing product is intentionally lower risk than modifying a heavily established record, but unapproved submissions must not be written into the canonical product catalog.

Milestone 4 adds automated evidence checks after the deterministic preflight:

```text
submit
  ↓
authenticate + rate limit
  ↓
deterministic validation
  ↓
duplicate / relationship checks
  ↓
temporary image staging + content-hash deduplication
  ↓
Cloudflare Clef / Clef-flash (when enabled)
  ↓
VeganAlts policy engine
  ↓
READY / NEEDS_CHANGES / NEEDS_REVIEW / BLOCKED
  ↓
READY → canonical insert
REVIEW → pending submission
CHANGES → return actionable errors
BLOCKED → explicit abuse rule; nothing is stored as catalog data
```

Minimum product submission should eventually include:

- country;
- brand;
- product name;
- at least one replacement category;
- product-front image or other credible identity evidence;
- vegan/plant-based evidence state sufficient for current policy.

Before approval:

- canonical product/version/category/image rows are not created;
- uploaded evidence may live temporarily in R2;
- ambiguous submissions may be persisted only as pending-review records.

After approval, canonical records are created and approved images are promoted to canonical R2 keys.

Abandoned/rejected temporary uploads are deleted after a configured retention window.

The launch minimum is set in the milestone 6 policy below.

## 4. Edit proposals

Established factual changes create `edit_proposals` rather than directly overwriting canonical data when the change is medium/high risk.

A proposal records:

- target type/id;
- change type;
- proposed structured data;
- rationale/note;
- evidence URLs or media references;
- contributor;
- risk tier;
- status;
- resolution metadata.

Possible statuses:

```text
pending
accepted
rejected
superseded
withdrawn
```

## 5. Confirmation workflow

Other users may respond to a pending proposal with:

- Confirm;
- Disagree;
- Add evidence.

A confirmation is not a generic report. It asserts that the contributor independently supports the proposed fact change.

The system may automatically accept some proposals after confidence thresholds are met.

## 6. Risk tiers

### Tier 1 — low risk / direct contribution

Examples:

- add an existing canonical retailer;
- rating;
- comment;
- Tried;
- non-controversial metadata addition that does not overwrite protected facts.

These normally apply immediately.

### Tier 2 — confirmable factual changes

Examples:

- new packaging;
- new product variant relationship;
- discontinued status;
- retailer no longer carrying a product;
- product rename with supporting package evidence;
- certain formula-change proposals.

These can become true after sufficient independent confirmation and/or trusted-contributor evidence.

### Tier 3 — protected changes

Examples:

- vegan-status change;
- major formula transition;
- changing an established brand/product identity;
- duplicate merge;
- deleting/depublishing an established product;
- major category reassignment/removal;
- removing important evidence;
- resolving malicious/contested edits.

These require high confidence and may require manual moderation even if confirmations exist.

## 7. Adaptive protection

The same edit can require more confidence on an established/high-impact record than on a new record.

Signals that may raise protection:

- ranking prominence;
- number of ratings;
- page traffic;
- previous vandalism/contested edits;
- brand sensitivity;
- number of dependent relationships;
- legal/safety significance.

Protection rules belong in moderation policy/configuration, not scattered UI code.

## 8. Contributor trust

Contributor trust is a **post-launch** capability.

Do not calibrate a trust/reputation algorithm until VeganAlts has enough real contribution history to identify which signals are actually predictive of reliable factual edits.

Potential future signals include:

- account age;
- accepted product additions;
- accepted edit percentage;
- accurate evidence submissions;
- accurate reports;
- retailer confirmations;
- previous moderation reversals;
- rate-limit/abuse history.

Milestone 4 moderation must work without a computed trust score.

### Important separation

Contributor trust must **not** increase ranking vote weight.

A trusted moderator's 5/5 similarity rating still counts as one person's rating.

## 9. Vegan / plant-based status

VeganAlts uses an ingredient-based operational classification while separately recording manufacturer labeling/certification.

Suggested states for the four existing store-photo batches (owner revision,
2026-10-22):

- `vegan` — the package has a vegan word or mark. That claim controls when an ingredient origin is unclear; a confirmed animal-derived ingredient still needs an owner decision;
- `appears_plant_based` — there is no vegan package claim and the ingredient list has an unresolved origin, unreadable text, or no usable source;
- `plant_based` — there is no vegan package claim and the ingredient list is clean with no flags, whether or not the package says plant-based;
- `under_review` — a credible concern is being investigated.

The package claim and ingredient assessment are separate evidence. For the
existing photo batches, a clear label is transcribed once after the double-read
pilot; unreadable sections may be supplemented from an exact-product online
source, recorded with its URL and lookup date. Online text remains
distinguishable from the package transcription. An explicit vegan package
word or mark controls even if an ingredient origin remains unclear. Without a
vegan package claim, a clean list with no flags supports Plant-based; an
unclear origin, unreadable text, or missing usable source supports Appears
plant-based. A confirmed animal-derived ingredient is held for the owner's
decision. Image identity, relevance, quality and safety are checked once for
the photos currently available in batches 1–4; concerns go to the operator.
This one-time batch review does not change the image moderation flow for
future uploads.

Do not let simple popularity voting decide ingredient status.

A credible “contains animal ingredient” report should receive high priority and may immediately move a record to `under_review` while evidence is assessed.

## 10. Formula changes

Material reformulations are protected changes because they affect ranking validity.

Workflow:

```text
Proposal: formula changed
        ↓
Evidence: ingredient/package/manufacturer info
        ↓
Confirmations / trusted review / moderation
        ↓
Accepted
        ↓
Old product_version closed
New product_version created/current
        ↓
Current ranking begins using new-version ratings only
```

Do not create an entirely new product solely because its formula changed.

## 11. Discontinued products

Discontinued products remain in history.

Accepted discontinuation:

- marks product lifecycle status;
- removes it from normal active Top/New discovery as appropriate;
- preserves ratings/comments/history;
- keeps direct pages accessible unless another policy requires removal.

## 12. Photo moderation

Product pages use canonical image slots rather than unlimited galleries.

Typical slots:

- front;
- back;
- ingredients;
- nutrition;
- prepared.

When a canonical slot is already filled, users normally **Suggest replacement** instead of appending another duplicate image.

Reasons:

- updated packaging;
- better clarity;
- wrong market;
- formula evidence update;
- current image is incorrect.

Accepted historical images stay linked to the formula/version they document.

## 13. Retailer moderation

Normal user flow selects an existing retailer record, preventing spelling duplicates.

Adding a truly new retailer is a distinct flow with canonical name/country/site information.

Product-retailer relations can collect independent confirmations and “no longer found” signals.

VeganAlts does not claim live inventory.

## 14. Duplicate handling

**Milestone 3 decision (2026-10-07):** the approved [milestone specification](MILESTONE_3_PLAN.md) replaces the transfer semantics below with archival consolidation. The selected survivor's metadata and scores stay unchanged; all donor data remains recoverable under its original identity but is excluded from public results. Do not transfer donor votes or discard canonical history. Retain reversible uncached redirects and an operator reversal. This explicitly amends issue #22.

Duplicate reports are protected because merges affect ratings, URLs and history.

A merge operation must define:

- surviving canonical product;
- redirect/alias from duplicate slug;
- category memberships;
- comments;
- retailer relationships;
- images/evidence;
- formula versions;
- rating migration only when records genuinely represent the same formula/product identity.

Never blindly sum/migrate ratings across products that may represent different formulas or markets.

## 15. Reports

### Product reasons

- Not vegan / ingredient concern
- Incorrect product information
- Duplicate product
- Discontinued
- Wrong category
- Doesn’t belong on VeganAlts (`out_of_scope`): not intended to imitate an animal-based original, or a mix without manufacturer-supported vegan preparation
- Misleading content
- Other

### Photo reasons

- Wrong product
- Outdated
- Poor/unreadable quality
- Inappropriate
- Copyright concern
- Other

### Comment reasons

- Spam
- Harassment
- Off-topic
- Misleading product information
- Other

Reports create moderation signals; they do not automatically prove the allegation.

## 16. Audit log

Material accepted changes write an immutable audit entry containing:

- actor/resolver;
- entity type/id;
- action;
- timestamp;
- before state where appropriate;
- after state;
- source proposal/report;
- resolution note when relevant.

The audit log is not necessarily public in full, but it is necessary for reversibility and accountability.

## 17. Reversibility

Every protected data change should be reversible without reconstructing information manually from logs.

Formula history, product identity and accepted image history should never be destructively overwritten merely for convenience.

## 18. Moderation automation

### 18.1 Deterministic controls first

Before any model call, ordinary code should:

- authenticate contribution actions;
- enforce per-account and IP/network rate limits;
- enforce concurrency limits;
- reject malformed/oversized uploads;
- cap images and staged bytes per submission;
- detect exact repeated image uploads using content hashes;
- run exact/near duplicate checks;
- validate known category/retailer/entity relationships;
- enforce idempotency on submission/finalization operations.

Do not spend model quota on questions deterministic code can answer.

### 18.2 Temporary staging and quota protection

Community-supplied images/evidence may be staged in temporary R2 storage before approval.

Repeated identical uploads should not repeatedly trigger expensive image/model processing.

Transient provider failures and timeouts retain private automatic-check work with bounded retries. Quota exhaustion returns retry guidance before provider work. Neither creates a manual review task or permits automatic approval; ambiguous factual evidence still follows the existing review policy.

### 18.3 Clef is the initial automated decision provider

Milestone 4 adds Cloudflare Workers AI **Clef / Clef-flash** behind a provider-neutral interface such as `ModerationDecisionService`.

Use Clef-flash for simpler/high-volume finite decisions and full Clef for more ambiguous evidence/product/formula questions.

Prefer narrow structured questions such as:

- does this image match the claimed product?;
- what type of product evidence is this?;
- does this evidence support the proposed factual change?;
- is this contribution likely spam/commercial promotion?;
- does this product plausibly fit the proposed category?

The policy layer converts model probabilities into:

```text
READY
NEEDS_CHANGES
NEEDS_REVIEW
BLOCKED
```

Uncertainty routes to review rather than automatic rejection.

### 18.4 AI is evidence, not truth

Clef must not independently:

- declare a product definitively vegan;
- apply a major formula transition;
- merge/delete an established product;
- override community similarity ratings.

Protected factual changes still require the appropriate evidence/community/human review path.

Persist enough model/schema/probability metadata for auditability while avoiding unnecessary raw prompt/model text.

### 18.5 Future provider evaluation

OpenAI Decisions API, Jev, or later decision models may be benchmarked later against a labeled VeganAlts evaluation set.

They are not dependencies for the initial implementation.

Domain code should depend on the provider-neutral moderation interface so a later comparison does not require redesigning the workflow.

## 19. Brand/business participation

Future verified brand accounts may be allowed to:

- claim/verify official metadata;
- submit formula/packaging updates;
- provide manufacturer evidence;
- respond to factual questions.

Brands do **not** receive:

- boosted rating weight;
- power to delete negative legitimate ratings;
- purchased ranking position.

Sponsored visibility, if introduced, must remain clearly separate from organic ranking.

## 20. Creator/editorial collaborations

Future influencer/creator collections are editorial content, not ranking inputs.

Example:

```text
Featured creator: Top 5 Vegan Mozzarellas
1. Creator pick A
2. Creator pick B
...

Community Ranking remains separate below.
```

Creator partnerships may be paid if clearly disclosed. Neither payment nor creator status changes community scores.

This layer may become more important when ranked recipes are added later.

## Milestone 3 manual policy

The [approved scope](MILESTONE_3_PLAN.md) uses deterministic submission checks and manual operators; no external AI provider or community-confidence auto-acceptance is enabled. Publication requires a front photo plus ingredient evidence and creates only provisional classification (milestone 6 makes ingredient evidence optional). Vegan classification requires review. An operator accepting a held submission whose ingredients the contributor could not confirm chooses its classification; approval never defaults to a status the evidence did not support. Ingredient reports are prioritized but only an operator can apply Under Review. Pending submission media is private and expires after the configured review window. Comment-target reporting is supported/tested, with visible comment reporting deferred to the comment milestone. Retailer confirmations do not establish inventory; stale evidence is labeled after 180 days and an operator decides removal.

For a submission follow-up, its contributor can reopen the guided form from My contributions, revise the details and attach the requested photos. The response uses a new receipt under the normal quotas and always returns to manual review. Finalizing it atomically supersedes the original queue item, checks the requested revision, and audits both payloads. An intervening operator decision or competing response rejects the stale finalization. The original payload, request and evidence links remain in private history; temporary media retains its normal retention window.

## Milestone 4 policy

The [approved scope](MILESTONE_4_PLAN.md) enables automated decisions, community confirmation and comment voting on top of the milestone 3 workflows.

**Provider modes.** `MODERATION_PROVIDER` is `clef`, `fake` or `disabled`, independently of `CONTENT_SAFETY_PROVIDER`. Fake providers are accepted only in local development and tests. Disabling Clef retains deterministic evidence rules and disables community-confidence auto-acceptance; an enabled safety provider still checks contributed content. The safety and automatic-retry policy below supersedes the original milestone 4 outage behavior: transient failures remain private for bounded retries, and exhausted budgets return retry guidance without creating a review item. Existing held comments remain eligible for the legacy hourly re-evaluation path.

**Decisions.** The policy engine combines the deterministic result with the automated answers and keeps the more restrictive outcome; automation can hold or correct but never upgrade a deterministic hold. `NEEDS_CHANGES` returns an actionable reason without creating canonical rows. `BLOCKED` applies to any built-in OpenAI safety flag or an existing high-confidence Clef abuse rule (for example near-certain spam or commercial promotion) and stores no catalog data. Each evaluation records provider/model identities, schema/policy versions, input hashes, structured flags and scores, finite evidence answers, outcome, status, tokens and latency. Raw prompts and model prose are not stored. Identical recent payloads reuse an earlier decision only while content, image hashes, provider/model identities and effective policy still match.

**Comments.** Comments are opinions about a specific formula. Votes measure whether a comment helps someone understand the product, not agreement, and have no effect on similarity rankings. One account has at most one active up or down vote per comment and cannot vote on its own comment. Strongly downvoted comments collapse behind an explicit **Show** action; they are not deleted. Automation may hold likely spam, commercial promotion, duplicated text or off-topic content; it never rejects ordinary short opinions. Authors may edit or delete their own comments; operators may hide comments and reverse that action.

**Proposals and confirmations.** Ordinary users cannot overwrite established facts. Other active contributors may Confirm, Disagree or Add evidence once per proposal; the proposer cannot respond to their own proposal, and a changed stance replaces the earlier one. Evidence attached to a proposal that is open for community confirmation is visible to signed-in contributors; held new-product submissions remain visible only to their contributor and operators. Confidence is the lower bound of independent confirmation share among active accounts, so disagreement lowers it. Automatic acceptance additionally requires the change kind to be on the explicit allow-list, an enabled provider's latest READY decision, no disagreement, a minimum age and a minimum number of confirmations that rises for established products; any disagreement goes to an operator. Automatic acceptance is recorded by a dedicated system account that cannot sign in, through the same fenced, audited and reversible decision path used by operators. Tier 3 changes always require an operator.

| Tier                                               | Changes                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — immediate after deterministic checks and READY | Alias/search term, manufacturer source URL, photo for an empty slot                                                                                                                                                                                                                          |
| 2 — community-confirmable                          | Packaging photos, rename with package evidence, replacing an existing manufacturer source, variant relationship without eligibility change, discontinuation or same-formula reintroduction of a non-established product, category membership addition, front/back/prepared photo replacement |
| 3 — operator only                                  | Classification, reformulation, category removal or eligibility change, brand/identity change, ingredient or nutrition photo replacement, merges, category proposals, discontinuation of an established product                                                                               |

Milestone 3 stored tier 2 for every proposal except classification; new proposals use the tiers above, and automatic acceptance reads the allow-list rather than any stored value.

**Photos.** A product formula has at most one accepted image per slot. When a slot is empty, a contributor may add a photo. When it is filled, the action is **Suggest a better photo** with a reason: outdated packaging, blurry, wrong market, formula change or incorrect. A formula-change reason is routed to the reformulation flow. Replacements remain staged and non-canonical until accepted; accepting archives the earlier image under the formula it documents. A repeated proposal of the same image for the same product and slot becomes a confirmation and does not invoke the provider again.

**Categories.** Signed-in contributors may propose a missing category with a parent, country relevance, explanation, example products and aliases. Proposals are always reviewed by an operator, who may accept, reject or turn the name into an alias of an existing category; reserved route words and near-duplicates are rejected deterministically. Operators may rename (old slugs redirect), manage aliases, re-parent, retire and merge categories. Unlike product duplicates (§14), a **category merge transfers** memberships and ratings to the survivor because both categories describe the same conventional reference product. If a user rated the same formula in both, the most recently updated rating remains counted and the other is retained uncounted. Merges run in bounded, resumable steps, record every moved row, redirect the donor slug and can be exactly reversed while preserving ratings created afterward. Reversal is last in, first out: later merges and later edits involving either category are reversed first. Homepage features are configured separately from the hierarchy.

## Milestone 5 policy

The [approved scope](MILESTONE_5_PLAN.md) adds allergen declarations, per-country contributions and detail-dimension management to the milestone 4 workflows.

**Allergen declarations.** An allergen declaration is a proposed change of kind `allergens` on one formula version. It states either "no allergens declared on the label" or the allergens the label says it contains and may contain, chosen from the product country's allergen list. Declarations record what the package says; VeganAlts never infers allergens.

| Tier | Allergen declaration                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| 2    | Cites the formula's current accepted ingredients or nutrition-and-allergens photo                                    |
| 3    | Cites only a manufacturer page or a note, or the declaration contains milk, egg, fish, crustacean or mollusc (below) |

A tier 2 declaration is community-confirmable and may be accepted automatically under the milestone 4 rule: the latest automated evidence decision is READY, no active account disagrees, the minimum age has passed and it has the required confirmations. Any disagreement sends it to an operator. A declaration that says the product **contains** milk, egg, fish, crustacean or mollusc is never accepted automatically, because it contradicts an animal-free classification. It also opens a classification review: the system account files an `ingredient_concern` report on the product, linked to the proposal, which operators resolve through the existing Under Review decision. "May contain" statements describe cross-contact and do not open a review.

A reformulation starts the new formula with no declaration; earlier formulas keep theirs. Ingredient and nutrition photo replacement remains tier 3. Accepting, rejecting and reversing declarations use the same fenced, audited and reversible decision path as other proposals. Confirmations measure whether the declaration matches the label, never whether a product is safe; every allergen surface says "Always check the package."

**Per-country contributions.** Product additions, retailer choices, category proposals and allergen lists belong to the country of the page they start from. Adding a retailer that already exists in another country proposes that retailer's market in this country and follows the same review as a new retailer. Moderation queues and the taxonomy workspace show each item's country.

**Taxonomy and dimensions.** Category proposals choose a shelf. Aisles and shelves only need names that are unique among their siblings; foods and aliases stay unique across the taxonomy. Operators add, rename, reorder and retire a food's detail dimensions; retiring keeps stored answers, and every change is audited and reversible. Category merges now carry detail answers: answers follow their rating to the survivor by dimension key, a key only the donor had is kept on the survivor as a retired dimension, and reversal restores both exactly.

## Milestone 6 policy

The [approved scope](MILESTONE_6_PLAN.md) lowers the submission minimum, adds a visible unchecked-ingredients state and lets a missing food travel with the product that needs it. It supersedes the milestone 3 rule that publication requires ingredient evidence and settles §3's launch minimum.

**Submission minimum.** A submission needs a country, brand, product name, at least one food (existing or suggested) and a front photo. Ingredient evidence, a classification note, back and nutrition photos, variant details, further foods, a rating, stores and an allergen declaration are optional. At most four photos are accepted, the limit of the automated photo check.

**Provisional classification.** The deterministic result is never "classification needed":

| Ingredient evidence | "Nothing animal-derived" ticked | Manufacturer label        | Classification          |
| ------------------- | ------------------------------- | ------------------------- | ----------------------- |
| none                | any                             | any                       | ingredients not checked |
| given               | yes                             | any                       | appears plant-based           |
| given               | no                              | plant-based               | plant-based             |
| given               | no                              | vegan, neither or unknown | ingredients not checked |

Giving more evidence never produces a worse outcome than giving less. When the only ingredient evidence is a photo and the automated check flags it as unreadable or not an ingredient list, the classification is downgraded to "ingredients not checked" instead of holding the submission; automation still never upgrades a result. Near-duplicates, variant relationships, specialty flavors, follow-ups and suggested foods still hold for review. A declaration that the product contains milk, egg, fish, crustacean or mollusc holds the submission for review before publication. An operator accepting a held submission without choosing a classification publishes it as "ingredients not checked".

**Ingredients not checked.** The state is shown as "Ingredients not checked yet". The product ranks and can be rated. It is not a vegan status: it records that no one has confirmed the ingredients. On such a formula, a classification change that chooses Appears plant-based or Plant-based and cites the formula's accepted ingredients or nutrition photo is **tier 2**: community-confirmable and automatically acceptable under the milestone 4 rule, and any disagreement goes to an operator. Every other classification change, including Vegan, Under Review and any change without a cited photo, stays tier 3. Accepting any reviewed classification marks the ingredients checked, and reversal restores the earlier state exactly.

**Suggested foods inside a submission.** A submission may suggest one new food (name, shelf, optional other names) in place of, or beside, existing foods. Preflight applies the standalone suggestion rules: an open country, a valid shelf, a name and other names unused across the taxonomy, reserved words, and the shared daily limit of three suggestions. Finalization evaluates the product and the suggestion and holds both together; the submission waits while its food is undecided. An operator decides the food first:

- **Accept or alias.** The waiting submission is re-checked with the resolved food. It publishes when nothing else needs review; otherwise it stays in the queue with its remaining reasons. An alias decision also switches the existing food on in the suggestion's country.
- **Reject.** Each waiting submission receives a follow-up asking its contributor to choose an existing food. The revision always returns to manual review.

Accepting a suggested food as non-rankable while a product waits on it is refused. Every step uses the fenced, audited and reversible decision paths.

**Standalone suggestions.** The explanation is optional. Suggestions still choose a shelf and belong to the country of the page they start from, and operator review shows that country.

**Extras at publication.** Stores are confirmed in the publication batch. The contributor's rating is saved through the canonical rating path after publication, only if they have not rated that food; an allergen declaration becomes an ordinary allergen proposal citing the published photo, under the milestone 5 tiers. Extras on a superseded or rejected submission are never applied.

**Countries.** Operators can switch a food on or off per country; a food cannot be switched off where it has visible products. Switching is audited and reversible.

## Milestone 7 policy

The [milestone 7 specification](MILESTONE_7_PLAN.md) groups products into recipe lines. The owner decided on 2026-10-11 and 2026-10-12 that contributing stays as hands-off as possible: the community can grow lines freely, and reports and operator tools correct mistakes.

**Line membership.**

- **Rule.** A line holds products of the same brand and country that share one base recipe and differ only in flavor or seasoning. Changed bases are separate lines (PRODUCT_MASTER, milestone 7).
- **What does not hold a submission.** Joining an existing line, starting a new line and giving a flavor label never hold a submission on their own.
- **What every submission still needs.** Its front photo and the deterministic and automated photo checks.
- **What still holds,** as in milestone 6: near-duplicates, an animal-allergen declaration and a suggested food.
  - A near-duplicate shares two distinctive words with another product from the same brand, or with a product containing the whole name; a name with only one distinctive word needs that one. Generic words such as "plant-based", "vegan", "original" and "dairy-free" do not count (owner, 2026-11-04), and an apostrophe does not split a word.
  - Flavors already in the line the contributor chose are never near-duplicates of the new flavor.
  - The looser similar-name matching in Add a product only widens what is shown while typing; it does not widen the hold.
- **Administrator edits.** An administrator's Suggest a change form is Edit product: the same edits, applied at once as an accepted proposal with a required reason, skipping the automated and community steps (owner, 2026-11-04). Each is audited and reversible from Decision history. The form also sets which foods a product is listed under, which from a contributor is tier 3; a rated food keeps its ratings off the ranking.
- **Changing membership.** Moving a product to another line, starting a new line for an existing product and renaming a line are tier 3 (operator only). Each is audited with its before and after state and is reversible. Ratings never move; the affected lines are rescored.

**Reports.**

- **New reasons.** Product reports gain "This flavor doesn't exist" and "Not part of this line", beside the existing reasons such as discontinued, duplicate and wrong category.
- **Operator actions.** Operators resolve these reports with the line tools, the lifecycle change or Under Review.

**Flavors.**

- **Flavor labels.** Setting or changing a flavor label on an existing product is part of a rename and stays tier 2.
- **Excluding a flavor.** Excluding a flavor from a food's line score uses the existing eligibility change, which is tier 3.
- **Retired submission options.** The specialty-flavor checkbox is retired, and new submissions are always ranking-eligible in their foods.
- **Relationship types.** Contributions can no longer create `variant` or `specialty_flavor` relationships. Companion and successor links remain as edit proposals, limited to the product's own country.

**Suggesting a food.** With shelves removed, a food suggestion chooses an aisle instead of a shelf. Review is otherwise unchanged in this milestone.

**Seasonal tag.** A contributor can mark a product Seasonal when adding it (tier 1). Changing the tag later is a tier 2 edit. A food's season months are set by operators.

**Tier table changes.**

| Change                                                           | Tier          |
| ---------------------------------------------------------------- | ------------- |
| Joining an existing line or starting one at submission           | No hold       |
| Move an existing product to another or a new line, rename a line | 3             |
| Flavor label on an existing product (with rename)                | 2             |
| Eligibility exclusion of a flavor                                | 3 (unchanged) |

## Owner imports

The owner's reviewed store-photo batches reach the catalog through the [store photo importer](IMPORTER_PLAN.md) (owner, 2026-10-16).

- **No review queue.** Imported products are the owner's own contributions, attributed to the owner's account, and publish without the review queue or the near-duplicate hold. The existing photos in batches 1–4 receive a one-time identity, relevance, quality and safety check before import. Future uploads retain their separate moderation flow.
- **Deterministic checks still run.** Each product passes the submission contract, the same identity-key uniqueness that refuses exact duplicates, and the same classification rule as a submission.
- **Classification.** A vegan package word or mark controls Vegan even when an ingredient origin remains unclear. Without a vegan package claim, a clean list with no flags is Plant-based; an unclear origin, unreadable text or missing usable source is Appears plant-based. Confirmed animal-derived ingredients are held for the owner's decision. Risk levels stay internal and never determine a public status.
- **Audit.** Each product records a `product_import` moderation action by the owner, with its audit entry and a `product_published` audit entry like a submission's. Each run records its start and end. Stores the import needs are proposed and accepted through the retailer proposal path.
- **Reversal.** Reversing a product's `product_import` action from its moderation view hides the product, its photos and its place in rankings and search. Its rows stay.

## Automated safety and bounded retries (owner decision, 2026-10-23)

The owner approved OpenAI safety checks before the existing Clef evidence checks. For new community content, any OpenAI safety flag rejects the contribution with a request to revise; no extra score threshold applies. Private reports and owner-only tools/imports are exempt. Protected factual review requirements are unchanged. Profile changes require a successful safety check and have no queue.

Transient provider failures retain a private automatic-check job instead of a manual review item. The existing hourly schedule retries failed stages at most three more times (due after 1, 3 and 6 hours), respecting Retry-After and a 24-hour expiry. Exhaustion asks the contributor to resubmit. Rate/capacity denials do not create jobs. Every actual provider attempt, including scheduled retries, is bounded by atomic account/environment quotas and leases; successful unchanged stages may be reused. Checking content is never community-visible and cannot count toward confirmation.

## Production-readiness review (owner, 2026-10-23)

Catalog eligibility requires intent to imitate an animal-based original. A vegetable-focused substitute without that intent is outside scope. Mixes need package/manufacturer directions for a vegan preparation; contributor-invented substitutions are insufficient. Add-product guidance, policy wording and category-fit evidence checks share this rule. The moderation policy version changes so cached earlier-scope decisions are not reused. Missing intent/preparation evidence requires review, not an unsupported rejection claim.

A release review can exclude or hold a product using a reversible `catalog_review` action, hiding it from public discovery and contribution choices while retaining its formulas, photos, ratings and audit history. A hold means evidence is outstanding. Reclassifications retain old memberships as ineligible and use the existing reversal rules to preserve subsequent ratings. The release overlay and cleanup commands are documented in [catalog operations](operations/catalog-import.md).

**Owner exception, 2026-10-23:** before launch, the owner explicitly authorized deleting the rejected catalog entries and brownie mixes instead of retaining evidence holds, plus removal of verified duplicate entries. This is a bounded staging data cleanup, with a recovery bookmark and record backup, and must stop if a selected product has ratings, comments, trials or pending community work. Retain audit records and import receipts; source-review skip decisions prevent future imports from restoring deleted entries. This exception does not change normal moderation's reversible archival behavior or authorize production writes. Amy's Light in Sodium Medium Chili is retained alongside Daring in the shared Chili food, with separate recipe lines. The Cocojune variety pack is represented by individual Vanilla Cinnamon and Raspberry products.

Reversal review displays the stored post-decision values and values to restore, with explicit food, line, product, formula and photo labels. These are recorded values, not a promise that the current state is unchanged. The existing conflict check and mandatory reason still gate compensation. Created recipe lines remain after a reversed move; later contribution history is preserved.

## Direct operator controls (owner, 2026-10-23)

Product reports offer **Doesn’t belong on VeganAlts**, separately from **wrong category**. The report alone leaves public visibility unchanged. An operator can resolve an assessed scope report with **Remove product from catalog**, with a required reason and current product/report revisions.

Signed-in operators see **Manage product** in Product facts. Its workspace offers **Remove from catalog**, a preview of the visibility change, and a required reason before confirmation. This uses the existing reversible `catalog_review` exclusion: the product leaves public pages, search, ranking and contribution choices; its photos, formulas, ratings and comments remain. The removal appears in **Decision history**, where **Review reversal** can restore it subject to the existing conflict checks. This control does not permanently delete database records.

Visible comments have a direct **Hide comment** button for operators. The confirmation requires a reason and the revision of the comment displayed; an intervening edit or moderation action requires a reload. Hiding records a `comment_hide` action and keeps text and votes. No report is needed. The confirmation links to the product’s decision history for reversal. Author deletion remains a separate action.

Operator controls appear only through private session hydration; public page loaders remain anonymous and cacheable. Every write independently requires an active allowlisted operator, same-origin validation and an idempotency key. Product removal invalidates affected public pages, listings and photos; comment hiding invalidates public comment/product views through the existing moderation invalidation path.
