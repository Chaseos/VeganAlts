# Foods menu and seasonal tag refinements — 2026-10-20

Before this change, selecting a category in the Foods menu mounted a fetcher for the category page loader, for example `GET /us/cheese.data?_routes=routes%2Fcategory`. Links also prefetched category routes on intent. The loader returns rated top-product previews; with no ratings, the menu showed a loading message followed by an empty preview.

The menu now lists Categories and their food types with product counts from the embedded country navigation tree. Hover, focus and local filtering do not load or prefetch catalog data or discover routes. Food links retain saved store/allergen filters, and deliberate navigation still uses the normal category and food pages. Keyboard, pointer, touch and no-JavaScript entry points remain available. Public aisle labels now say Categories; existing URLs and internal identifiers are retained.

Foods and products use one shared Seasonal badge with no dates or month ranges. Operators can still maintain existing season metadata; no database change is required.

## Verification

- Type generation and strict TypeScript checks passed; the staging build passed.
- All 19 focused design-token, product-draft and category-order unit tests passed.
- The desktop/phone category and discovery journeys passed: 10 passed, two context-specific skips. Coverage includes seasonal label text, directory links, home/footer consistency, category navigation, ranking views, thumbnail loading, accessibility in both themes and 320px reflow.
- The expanded menu journey passed every category by real hover, local filtering, keyboard movement, focus restoration, outside dismissal, and 760px layout, with zero catalog or route-manifest requests before deliberate navigation.
- The follow-up run passed seven additional menu, country-switch and contribution cases, with two context-specific skips. The phone country keyboard case initially opened the native disclosure before hydration, whose initial navigation effect then closed it. Waiting for the interactive Menu button, as the neighboring keyboard journey already does, fixes the test timing; that focused rerun passed. Assertion timeouts and accessibility checks were retained.
- Chrome inspection confirmed the category/food-type grid and plain Seasonal tag. Captures remain in ignored `test-results/captures`. No schema, data, ranking or authentication behavior changed.
