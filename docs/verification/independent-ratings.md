# Product gallery and independent ratings — 2026-10-20

The product page omits its section-link row. Its existing photos form a thumbnail, arrow and swipe carousel; thumbnail focus stays at the thumbnail instead of moving the page. Native thumbnail and keyboard selection still work without JavaScript.

Closeness and tastiness save independently on the product page and in Add a product. Either answer can be cleared without clearing the other. Clearing closeness clears its comparison details and familiarity; clearing both removes the canonical rating and retains Tried. Each ranking's population and per-person means include only its own answers. Taste-only lines can rank in Tastiest without acquiring a Closest rank. Sign-in recovery and My ratings preserve and display both nullable answers.

## Local verification

- Type generation and TypeScript checks passed; final `tsc --noEmit` passed.
- Full Vitest run: 303 passed and one 5-second timeout in the 1,001-product pagination test. The targeted rerun passed all 30 tests, including that unchanged timeout, independent flavor means, publication extras, clearing/rebuild/exclusion behavior, and pending-answer recovery. Checks were not weakened.
- The 24 desktop/phone Playwright journeys passed across the initial run and targeted rerun. Four new gallery assertions initially used “Nutrition” instead of the existing “Nutrition & allergens” label; these were corrected. One existing mobile session-loss journey timed out and passed unchanged on rerun. The final six-test rerun passed, covering mouse/touch swipes, arrow wraparound, keyboard activation after swiping, no scroll movement, no-JavaScript selection, both themes and 320px layout. Taste-first sign-in, reload, My ratings and independent clearing passed on desktop and phone.
- `npm run build:staging` passed.
- Chrome visual inspection confirmed the carousel and both enabled rating scales. Captures stay in ignored `test-results/captures`.

## Staging rollout

The previous live schema required similarity. A read-only preflight found 824 products, two accounts, zero ratings and zero detail answers. Version 1 and its schema snapshot include the nullable similarity column and the constraint requiring at least one answer.

The approved one-time plan recreated only the two empty rating tables in one D1 batch, restoring all 15 related triggers and five explicit indexes. An atomic guard refuses to proceed if either table contains rows. It was tested against the previous baseline in SQLite and a separate local D1 database: products, accounts and formula revisions remained identical; foreign keys passed; the canonical service saved a taste-only answer; populated-table refusal rolled the whole batch back.

The owner explicitly approved the one-time exception to AGENTS.md on 2026-10-20. Before execution, a fresh D1 Time Travel bookmark and an export of the two rating tables were saved outside Git. Cloudflare refused the full SQL export because of FTS5; the table-specific export succeeded, and Time Travel provides full-database recovery.

The live schema matched the reviewed plan. The atomic update completed at 2026-10-20 18:26:45 UTC. Post-update verification found the similarity column nullable, the at-least-one-answer constraint present, all related schema objects restored exactly and no foreign-key violations. Counts were unchanged: 824 products, 824 formulas, 1,652 photos, two accounts/profiles, zero trials/comments/ratings/detail answers, and 824 formula revisions. No catalog, authentication, photo or user contribution data was reset.

The existing Worker remains compatible until the new code is deployed. After taste-only writes begin, prefer a forward code repair over rolling back to code that assumes similarity is always present.
