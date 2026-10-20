# Product details refinements — 2026-10-20

Expanded recipe-line cards and the product page's Other flavors show each flavor's own accepted current front photo, with the existing food-icon fallback when none is available. Pending photos stay private. Product siblings without a formula retain their previous visibility.

The representative flavor now has the most counted ratings answering either primary question in that food. A row answering both counts once; excluded ratings, ineligible flavors and historical formulas do not count. Closeness remains the score tie-break for equally reviewed flavors. Ranking ties use stable recipe-line IDs so a change of representative cannot change either ranking's order. The domain reference and persisted refresh follow the same rule.

Full-size photos open in a native dialog with previous/next controls, horizontal swipes, arrow keys, Escape and focus restoration. Both the main gallery and photo contribution slots use this viewer. Native thumbnail selection and direct image links remain available without JavaScript. The product page uses compact rating headings, styled Unrated states without zero-person counts, and a separate retailer contribution row.

Product facts has one Report product entry. Its form can select product information or any public product photo, preview the selected photo and offer the corresponding reasons. Photo reports retain their canonical image target and existing moderation behavior. Earlier photo-specific deep links enter this same form.

Daiya's US [cheddar shreds](https://daiyafoods.com/products/dairy-free-cheddar-shreds) and [cheddar slices](https://daiyafoods.com/products/dairy-free-cheddar-slices) have different manufacturer ingredient lists: the shreds include tapioca starch and safflower oil, while the slices use modified potato starch. They remain separate under the documented same-base-recipe grouping rule. No catalog merge was made.

## Verification

- Type generation and TypeScript checks passed, including final `tsc --noEmit`; `npm run build:staging` passed.
- The full Vitest run passed 308 of 310 tests. The design-token guard identified a literal backdrop color, which was replaced with the existing backdrop token. The unchanged 1,001-product pagination test hit its five-second limit. The focused rerun passed all 14 design-token and filter tests without weakening checks. Recipe-line selection, both ranking orders, aggregate rebuilds and per-flavor image reads passed in the full run.
- All 20 desktop and mobile Playwright journeys passed across the initial run and focused rerun. Coverage includes actual thumbnail loading, expanded cards and siblings, compact rating geometry, empty and populated store rows, Unrated-to-rated counts, real product/photo report submissions and legacy deep links, mouse/touch swipes, carousel wraparound, keyboard navigation, focus and scroll restoration, native no-JavaScript controls, both themes, accessibility and 320px layout. Initial new assertions incorrectly assumed the demo product had stores and captured a URL before navigation; the fixtures/assertions were corrected.
- Chrome visual inspection confirmed the layout and full-size dialog. Captures remain in ignored `test-results/captures`.
- A read-only staging preflight found zero ratings. The representative policy therefore requires no adjustment to existing staging data, and future writes refresh the representative through the normal rating service. No schema change or data reset is involved.
