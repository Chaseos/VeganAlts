# Shared food navigation groups — 2026-10-20

Six presentation groups now organize the desktop Foods menu, phone chips and expandable phone menu, and the full country directory. Categories and foods retain their existing identities, country visibility, names and popularity ordering. Home and footer keep six popular category shortcuts. Unknown future categories appear under More foods, and the legacy combined bakery category belongs to Bakery & baking.

The menu displays three food shortcuts per category; filtering searches every food and category name in the selected group. Hover, focus and filtering use the embedded country tree without catalog requests or route discovery. Group links open directory anchors. Direct anchor visits defer the active-chip fragment state until hydration, matching the shared server document.

Add a product and Suggest a food reuse the mapping as headings in their existing Category selector. Category IDs, request payloads, country selection, validation and moderation are unchanged. Empty categories remain available for suggestions. No additional form step, database change or reset is needed.

## Verification

- Strict type checking and the staging production build passed.
- All 20 focused unit checks passed: mapping coverage and uniqueness, fallback visibility, country names and ordering, full filtering beyond the shortcut limit, active groups, existing food matching and draft behavior.
- All seven country-food and category-order persistence checks passed.
- Focused browser journeys passed on desktop and phone: grouped navigation, direct directory anchors, country availability and names, current-group disclosure, keyboard and pointer controls, no-JavaScript navigation, popular home/footer shortcuts, draft restoration, grouped suggestion preselection, and inline food suggestion through moderator acceptance.
- The desktop menu journey observed zero catalog or route-manifest requests while opening, switching and filtering. Accessibility checks cover both themes and horizontal overflow. Direct directory loads are checked for hydration errors.
- Draft verification uses the existing Continue it choice when reopening a new-food suggestion. The narrow-desktop pointer test reacquires its group after resizing, because reflow can move another group beneath the stationary pointer.
- Local browser tests ran in an isolated source copy with its own existing demo database. Captures at 1280, 760, 390 and 320 pixels in both themes remain in ignored `test-results/captures`; no screenshots are committed.
