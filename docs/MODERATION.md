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
- helpful reactions.

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

Milestone 3 uses a deterministic/manual preflight with no external AI dependency:

```text
submit
  ↓
authenticate + rate limit
  ↓
deterministic validation
  ↓
duplicate / relationship checks
  ↓
temporary image staging
  ↓
READY / NEEDS_CHANGES / NEEDS_REVIEW
  ↓
READY → canonical insert
REVIEW → pending submission
CHANGES → return actionable errors
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

The exact launch minimum remains a milestone UX decision.

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

Suggested states:

- `vegan` — available evidence supports no animal-derived ingredients;
- `appears_vegan` — no known animal-derived ingredients, but evidence is incomplete or weaker;
- `plant_based` — useful market label when VeganAlts cannot establish the stronger ingredient status;
- `under_review` — a credible concern is being investigated.

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

Provider failures, quota exhaustion, and timeouts must degrade to a retryable or **NEEDS_REVIEW** state, never automatic approval.

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