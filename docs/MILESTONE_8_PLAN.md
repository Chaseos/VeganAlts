# Milestone 8: local languages, country foods and AI review

Repository: `website/VeganAlts`, branch `develop` at `7c7482a`. The owner approved this plan on 2026-11-05; nothing in it has been built yet, and the decisions in section 12 are still open. The 25 new countries stay a separate proposal; this plan adds only Japan and French for Canada.

## 1. Context

The site is English only, and an operator must decide every suggested food. That can't work in countries the owner doesn't know. The plan makes three changes:

- Each country gets its own languages, in URLs that can be cached and indexed.
- Local foods and aisles can be suggested in the local script.
- AI review replaces the operator for new foods and aisles, and every decision can be undone.

Canadian French tests two languages in one country. Japan tests a non-Latin language with foods of its own.

## 2. What the code and tests showed

These findings change the starting rules in the brief.

| Finding | Evidence | What it means |
|---|---|---|
| **Clef cannot write text** | Its question types are `noul`, `choice` and `score`, and it returns only probabilities. `clef-provider.ts` uses `choice` only. | It cannot give the English explanation or translation. A second, text-generating model is needed. |
| **Clef's documentation does not mention Japanese** | The model pages and launch post name no language other than English. Clef is built on Qwen, which is only a hint. | Japanese quality must be measured. See §6.5. |
| **Clef silently cuts long input** | Clef-flash's context is 24,576 tokens, and anything over the limit in `state` is truncated. | The food candidate list needs a hard size guard. |
| **`docs/TECH_STACK.md` is out of date** | Clef-flash is now $0.038 per million input tokens, not $0.09. | Update the ADR. |
| **Japanese food names fail today** | `categorySlug("唐揚げ")` returns `""`, so `assertCategorySlug` rejects the suggestion. | Script-safe helpers come first. |
| **`categoryKey` makes all Japanese names equal** | Every Japanese name gets the key `""`. This would break name uniqueness, and `silentAisle` would treat any one-food Japanese aisle as silent. | Same fix. |
| **French ligatures break slugs** | `"Bœuf haché"` becomes `b-uf-hache`. | Same fix. |
| **Product slugs still work, but read badly** | `slug()` falls back to `product`, and the ID suffix keeps it unique. A brand gets the same word. `大豆ミートの唐揚げ 100g` becomes `100g-…`. | Needs a better fallback. See §5.6. |
| **Near-duplicate checks miss Japanese** | `nameWords("豆腐")` returns `[]`, because words under three characters are dropped. A long name counts as one word. The generic words are English only, so `ヴィーガン` counts as distinctive. | See §7. |
| **`unicode61` misses most Japanese queries** | 揚げ, ごし豆腐, ミルク and ミート found nothing. | See §8. |
| **`trigram` isn't the fix** | 豆腐, 牛乳 and 餃子 found nothing, because a query needs three characters. `LIKE` works but scans the table. | See §8. |
| **Karaage needs no new food type** | `category_countries` already limits a food to one country. | See §3. |
| **Local aisles nearly exist already** | `aisleTree` hides an aisle with no food in that country. | See §3. The exception is the Suggest a food picker, where `withEmpty` lists every aisle. |
| **Accepted foods can't be undone** | `reverseUpdate` does not accept `category_create`. | Undo must be built. See §6.7. |
| **Food changes purge every country** | `invalidationTags` for a category purges `surface:*` everywhere. | Auto-accepting foods would undo the speed work, so purges must be limited to one country. |
| **Moderation is off in production** | `MODERATION_PROVIDER` and the safety provider are `disabled` in production. | AI review needs them on before launch, and a defined behaviour when they are off. |

## 3. Foods and aisles: the smallest change (item 1)

**Foods need no new table.** Karaage is one more row in `categories`, under an aisle, with a `category_countries` row for Japan only. Ratings, rankings, lines, the sitemap and search all work as they do now.

- `categories.name` stays the **English working name** ("Karaage"), which keeps slugs, admin screens and existing code working.
- The Japanese name 唐揚げ goes in the names table (§5.1). Karaage is its own food, not a translation of Chicken Nuggets.
- The food picker still lists foods from other countries, so someone in the US can pick Karaage and switch it on there.

**Name uniqueness narrows.** Milestone 5 made foods and aliases unique across the whole taxonomy. That breaks once "chips" or "biscuit" means different things by country.

- English base names stay globally unique, because slugs come from them.
- A country or language name only has to be unique within that country.

**Aisles: the locked decision to change on purpose.** Milestone 7 says "The aisles are universal… 23 of them, the same in every country" and "the macro categories shared by every country". Following the `AGENTS.md` steps:

1. **Conflicting sources:** `docs/MILESTONE_7_PLAN.md` (lines 83, 159 and 419, and the milestone 8 proposal), the `AGENTS.md` milestone 7 paragraph, and the Taxonomy notes in `docs/ARCHITECTURE.md`.
2. **Why it no longer fits:** the owner expects most aisles in a country like Japan to be local, and some foods have no home in the 23.
3. **Smallest revision:** "The 23 shared aisles remain the base in every country. A country may also have local aisles. A local aisle is an ordinary aisle with `origin_country_id` set, and it appears only where one of its foods is on. If another country switches on one of its foods, the aisle appears there too, with no separate step. There is still no extra level, and each food still has one aisle. An aisle still names a kind of product, not an occasion."
4. **Schema:** add a nullable `categories.origin_country_id`. `NULL` means shared.
5. **Picker fix:** the `withEmpty` aisle list leaves out local aisles from other countries.

I recommend against an "Other foods" aisle, because it fails the milestone 7 test that an aisle names a kind of product. A food instead goes in the nearest existing aisle until it can move (§6.4). `navigation-groups.ts` already sends unmapped aisles to its More foods group.

## 4. Languages, URLs and cache (items 6, 7, 8)

### 4.1 Country languages live in code

New file `server/catalog/domain/languages.ts`:

```ts
export const LANGUAGES = ["en", "fr", "ja"] as const;
export const COUNTRY_LANGUAGES = {
  jp: { default: "ja", offered: ["ja", "en"] },
  ca: { default: "en", offered: ["en", "fr"] },
} satisfies Partial<Record<string, CountryLanguages>>;
// Any other country: { default: "en", offered: ["en"] }.
```

It is code, not a table, because the gateway must decide before any D1 read. Adding a language needs a translation file and a deploy anyway. `offered` lists only languages that are ready. Until then a language can be previewed on staging through `PREVIEW`, which keeps a half-translated language from going public.

### 4.2 URL shape

| URL | Page |
|---|---|
| `/ca/en/ground-beef` | Canada, English |
| `/ca/fr/ground-beef` | Canada, French |
| `/jp/ja/karaage` | Japan, Japanese |
| `/jp/en/karaage` | Japan, English |

- The first two segments are always the country and the language (owner, 2026-11-05). The site hasn't launched, so no public address is lost.
- The slug is the same in every language, as the owner decided.
- `/ca/ground-beef` redirects to the visitor's language or the country's default with a 302, and `/us/fr` to `/us/en`, both from the URL and cookie alone.
- `/` still shows the United States home, with `/us/en` as its canonical address, so a returning visitor can be sent to their saved country.
- All codes in `LANGUAGES` join `RESERVED_SLUGS`, so `/ca/fr` can never be read as a food.
- `app/routes.ts` generates a static `prefix(":country/fr", …)` and `prefix(":country/en", …)` block with unique IDs. A static segment outranks `:categorySlug`.
- A single `parsePublicPath` in `public-cache.ts` strips the language segment first. `publicRoute` gains `language`, and loaders read it from the same parser.

### 4.3 Cache and memo

- **Document identity:** the path already differs by language. `__language` is added anyway and stripped in `PublicCatalog.fetch`, next to `__country`.
- **Public API:** gains an optional `language` query parameter, defaulting to the country's default. `normalizedPublicRequest` includes it in the key, and `/api/v1` stays compatible.
- **Cache tags:** no change. `category:{cc}:{slug}` and `product:{cc}:{slug}` already appear on every language's page, so one purge covers all of them. A test will prove this.
- **Category purges:** `MaterialCatalogChange` for a category gains an optional `country`, and uses `surface:{kind}:{cc}` when given. Taxonomy services pass it for one-country changes. Global changes keep today's behaviour.
- **`ReadMemo`:** `taxonomy:{countryId}:{language}`. The per-render category map key also gains language. `filters:{countryId}` stays shared, because labels come from the UI dictionary by allergen key.
- **Client:** `shouldRevalidate` compares country and language. `browse-cache.ts` and instant search add language to their keys.
- `.data` requests are never redirected.

### 4.4 Cookie, account and gateway redirect

The URL always decides what renders. The cookie decides only where a visitor with a preference lands.

- **Cookie:** `va_lang`, one value from `LANGUAGES`. It is `SameSite=Lax`, `Secure`, lasts one year and is readable by scripts. `normalizedPublicRequest` already strips it before the shared renderer.
- **Setting it:** the switcher links to `?setlang=fr`. The uncached gateway validates the value, sets the cookie, and returns a `no-store` 302 to the clean URL. This works without JavaScript, needs no D1 read, and keeps `Set-Cookie` off shared responses. Switcher links are `rel="nofollow"`.
- **Gateway redirect:** in `languageRedirect`, for a `GET` document only, on a URL with no language segment: 302 to the cookie's language if the country offers it, else the default, `no-store`.
- **Explicit language URLs are never redirected.** `/jp/en/x` always stays English, so a shared link shows what was shared. Crawlers send no cookie and every listed address is explicit.
- **Switching country:** one pure function, `languageFor(country, preference)`, is used by both the gateway and `country-menu.tsx`. Client navigation doesn't pass through the redirect.
- **Account:** add `profiles.preferred_language` and return it in the private session projection. After hydration, a signed-in visitor with no cookie gets the account value. If a cookie exists and differs, the client saves it with `PUT /api/v1/me/language`. Public loaders stay anonymous.
- **Language prompt:** a one-time banner after hydration, built like the country prompt, compares `navigator.languages` with what the country offers ("View in English?"). It never redirects, and it matters most for English visitors who open `/jp`. I recommend no server redirect from `Accept-Language`, because cookie-less crawlers should see stable URLs.
- **Rule to amend:** `docs/ARCHITECTURE.md` milestone 5 says preferences live "never in cookies". Add: "Language is the one exception. It lives in a cookie read only by the uncached gateway, and public HTML stays identical for everyone at a given URL." Update the privacy policy too.

A country's text can differ from its language's shared text, so a page without a country in its address has to know the market. The browser saves the last country page in `va_market`, as `fr-be`, and pages such as `/account` read it for their language and country. `?country=` wins when a page has one. `va_market` never picks a country page's language, and it never reaches cached pages or the prompt, which stay with `va_lang`.

### 4.5 Header switcher

Add `app/components/layout/language-menu.tsx` beside `country-menu.tsx`, and add it to `phone-menu.tsx`. It appears only when a country offers more than one language. Each language is listed in its own name.

Path helpers (112 call sites) gain a `language` argument through a `useMarketPaths()` hook. Utility routes such as `/add-product` take `?language=` the way they take `?country=`.

## 5. Names, slugs and SEO (items 4, 5, 9)

### 5.1 Names by language

`is_display_name` allows one name per category and country, which can't serve Canada's English and French. Add a language to the existing table instead of creating a new one:

```sql
-- category_aliases
`language` text DEFAULT 'en' NOT NULL
-- replaces ux_category_aliases_display
CREATE UNIQUE INDEX ux_category_aliases_display
  ON category_aliases(category_id, COALESCE(country_id,''), language)
  WHERE is_display_name=1;
```

- The trigger that forbids a display name without a country changes to allow it when the language is not English. French then needs one global name, and only France or Canada differences need rows of their own.
- The `displayName` lookup order: country and language; then all-country and language; then country and default language; then `categories.name`. It also returns the language it found, so pages can set `lang`.
- `language` comes from a closed list and is inlined as a literal. That leaves the positional binds in `d1-repository.ts` alone (15 uses).
- `assertGroupAliases` allows display names on aisles but still refuses search terms.
- Existing rows, such as UK "Beef mince", become `en`.

### 5.2 Suggesting a food in a language

- `categoryProposalInput` and `submissionInput.newFood` gain `language`, which must be one the country offers. It defaults to the page language.
- Food names are normalized to NFKC on input, which turns half-width kana into full width.
- The name stays as typed and in its script. The English name, slug and readings come from AI review (§6).
- `shortText` requires two characters. Real single-kanji foods exist (餅, 鮭), so a new `foodName` allows one character for scripts without spaces. English stays at two.

### 5.3 Script-safe helpers

Add one module, `server/shared/domain/text.ts`, and replace the copies in `taxonomy.ts`, `policy.ts`, `brand-match.ts`, `brand-rows.ts`, `food-choices.ts` and `brand-picker.tsx`. `questionKey` in `admin-taxonomy.tsx` stays, because it makes fixed dimension keys, not name matches. `normalizeName` also stays, because stored brand and identity keys depend on it:

- `foldForMatch`: NFKC, lowercase, removes combining marks from Latin letters only (kana, Hangul, Thai and Devanagari need theirs), turns œ to oe, æ to ae, ß to ss, and katakana to hiragana.
- `categoryKey` becomes `foldForMatch` with all but letters, marks and digits removed. A test over the whole seed taxonomy must show existing English results don't change.
- `categorySlug` gains the œ fix and stays ASCII only.

### 5.4 hreflang, canonical and sitemap

- `hreflang(country)` becomes `hreflang(language, country)`: `ja-JP`, `en-JP`, `fr-CA`, `en-CA`.
- `countryAlternates` becomes `marketAlternates` and lists every country and language pair where the page exists, plus itself, in both directions. Each page lists the same set.
- Product and brand pages gain language alternates.
- `x-default` keeps today's rule: the US page, or the first country where the page exists. For a Japan-only food that means `/jp/en/…`.
- Canonical is always the page itself, never another language.
- `<html lang>` comes from the URL. Add `og:locale`.
- Product names, and any name that fell back to another language, carry their own `lang`. On Android this decides whether Han characters use Japanese or Chinese glyphs.
- The sitemap writes one `<url>` per country and language.
- A food page with no name in that language is `noindex`, and so is a provisional food with no products. Both are left out of the sitemap.

### 5.5 Pages outside a country

`/about/*` and `/users/*` are cached and have no country, so they stay English in this milestone, and the switcher doesn't appear on them. Private pages read the language from the cookie.

### 5.6 Non-Latin slugs

- **Foods and aisles:** the English or romanized slug from review, such as `karaage`, validated against the existing `[a-z0-9-]` rule. Operators can override it.
- **Products:** `slug()` gains a fallback. When a name yields no Latin text, it uses the primary food's slug, giving `/jp/products/karaage-1a2b3c4d`. The ID suffix keeps it unique, and no AI call is needed.
- **Brands:** the fallback becomes `brand-…` instead of `product-…`. Latin brand names work as they do now.
- **No Unicode slugs.** Encoded URLs get long, and cache tags and existing route rules are ASCII. English pages would also show Japanese addresses.

## 6. AI review of foods and aisles (items 2, 3)

### 6.1 How the starting rules changed

| Starting rule | Verdict | Reason |
|---|---|---|
| The model decides, explains and translates | **Split** | Clef only scores options. A text model writes, then Clef decides. The text model never decides. |
| Accept foods when confident | **Keep, with a daily cap** | Add a cap of 20 auto-accepted foods per country per day. Extra suggestions wait for the next day. Limits abuse. |
| Hold a new aisle until there is demand | **Keep, but nothing waits on it** | Otherwise a product waits on a food, which waits on an aisle, which may never fill in a new country. The food goes in the nearest aisle now. |
| Uncertain cases go to a manual queue | **Keep, with a deadline** | A queue the owner can't judge would stall again. Every item has a 72-hour deadline. |
| Show as provisional | **Keep, kept small** | A label and thirty days. It never changes scores. |
| Keep every decision audited and reversible | **Needs new work** | `category_create` has no reversal today. |

### 6.2 Flow

```text
Suggest a food, or Add a product with a new food
  ↓ auth, limits, Turnstile, deterministic checks, OpenAI safety
  ↓ text model: English name, gloss, slug, readings, translations (no decision)
  ↓ checks: length, script, no links; safety check on generated text
  ↓ Clef: is it a food, is it a duplicate, does the aisle fit, any claims
  ↓ policy engine
  ├─ ACCEPT    → food created by the system account, provisional, product continues
  ├─ ALIAS     → name added to the existing food, product continues
  ├─ CHANGES   → contributor told what to fix
  ├─ BLOCKED   → existing abuse rule
  └─ QUEUE     → English context for the operator, 72-hour deadline
```

Transient provider failures keep the existing private retries (1, 3 and 6 hours, 24-hour expiry), and nothing canonical exists until they finish. The text model counts as one more stage of that work.

### 6.3 Decisions

New decision kind `food_review` replaces `category_proposal` for foods, and `aisle_review` is added. `DECISION_SCHEMA_VERSION` and `POLICY_VERSION` both go up, so older cached decisions aren't reused.

Clef questions for a food:

- `food_reference`: is this a conventional food or drink with an animal-based original that shoppers replace, in this country?
- `same_food`: `NEW`, `SAME` or `UNCLEAR`. One choice among 21 options spread Clef's probability too thinly, so this stays a separate question.
- `closest_candidate`: `NONE` or candidates `C1`…`C20`, asked only when there are candidates. Names stay in `state` and options carry only IDs, keeping contributor text out of the question text.
- `aisle_fit`: `FITS`, or the nearest of the country's aisles by ID.
- `name_claim`: does the name make a vegan, allergen, health, price or brand claim? `ヴィーガン唐揚げ` is a product, not a food.
- `spam`: the existing abuse question.

Candidates are the foods in the chosen aisle, foods on in that country, and the top matches from search on the English name and gloss. An estimated token count is checked before the call. Over the limit, the request moves to full Clef. If it still doesn't fit, it goes to the queue, so nothing is silently cut.

Starting thresholds, replaced by 0.60 for Accept and Alias and 0.70 for Changes once §6.5 confirms them. Claims and abuse are checked first, then Alias, then the food check, so a food that Clef calls plant-based but the taxonomy keeps, such as kimchi, becomes an alias:

| Lane | Rule |
|---|---|
| Accept | `food_reference` YES ≥ 0.85, `same_food` NEW ≥ 0.85, `name_claim` NONE ≥ 0.85, `spam` low, all generated text valid |
| Alias | `same_food` SAME ≥ 0.90, and the top `closest_candidate` ≥ 0.50 |
| Changes | `food_reference` NO ≥ 0.90, or a claim ≥ 0.90 |
| Queue | anything else |

An English name matching an existing food only adds that food as a candidate. This is what stops 唐揚げ, translated "fried chicken", from being treated as the same as Chicken Nuggets.

**Claim words come first.** A deterministic list of vegan, plant-based and allergen-free words for each language rejects a claim before any model runs. The twelve-language run showed why: Arabic برجر نباتي ("plant burger") became an alias of Beef Burgers.

**Rules the AI cannot cross.** `FoodReviewService` writes only through taxonomy statements, and it has no path to `formula_classifications`, allergen declarations or product facts. A test confirms this.

The state sent to the models is built by a single function with an explicit field list: name, language, country, aisle and candidate names. No account, trust, reputation, contribution count or payment data enters it. A test confirms this too.

### 6.4 Aisle suggestions

Built at checkpoint 5. Beneath the aisle choice, in both `propose-category.tsx` and the Add a product food picker, "None of these really fit" asks for the missing aisle's name. `aisleId` stays required, as the closest aisle, and an optional `newAisle: { name }` sits beside it. This is simpler than the first design, where Clef chose the aisle: it needs no new path for a food without one, and it still works when review is off.

1. The food goes through §6.3 in the closest aisle, so **no food or product ever waits on an aisle.**
2. The hourly sweep turns each suggestion into demand on an `aisle_proposals` row, status `gathering`, joined to its foods through `aisle_proposal_foods`. These are new tables, because `category_proposals` can't take a new status without rebuilding it on staging. The same name in the same country is the same proposal.
3. Clef checks a proposal with enough demand against the aisles and the milestone 7 test that an aisle names a kind of product. A clear no, or a clear match with an existing aisle, closes it. Anything uncertain goes to the queue.
4. **It opens** when at least 3 distinct active accounts support it, or at least 5 visible products sit in its foods from at least 2 accounts. Accounts must be over 24 hours old. Clef must also rate it sensible at ≥ 0.85.
5. **Cap:** 6 local aisles per country and one new one per week. A proposal over the cap goes to the queue. A queue-only country queues every proposal with demand.
6. **On opening:** the system account creates the aisle and moves the foods created for it, using the audited re-parent path. A name added to an older food leaves that food where it is, and a food still undecided stays in the closest aisle. An operator can open or close any proposal from the digest. A local aisle's name is English until language names are added for it.
7. **Expiry:** after 180 days with no new support the proposal closes. The foods stay where they are.

### 6.5 Model choice and calibration

**First results, 2026-11-05:** see [verification](verification/milestone-8.md). Clef made no harmful decision but is too cautious at the thresholds in §6.3. At 0.60, 0.60 and 0.70, a held-out run of 52 new names passed in French and missed in Japanese by one case, caused by the candidate shortlist. That fix is in place but unmeasured, so run a fresh set, with labels checked by a Japanese speaker, before relying on these values. Haiku 5.5 is the text model, and Clef stays the decider: Haiku accepted known foods as new when deciding, and Gemma failed 33 of 129 cases.

Run `npm run moderation:calibrate:foods -- --confirm-remote-spend`. It has the same billing guard as `scripts/calibrate-clef.ts`, and `--dry-run` spends nothing. The draft questions and lanes live in `scripts/calibration/food-review.ts`, and move to `server/moderation/domain` in checkpoint 4. Record results in `docs/verification/milestone-8.md`.

**Decision model:** full Clef starts, with Clef-flash as the challenger. Flash is about six times cheaper and should become the default if it passes the same gates. Claude is a third challenger, because Clef's documentation says nothing about Japanese: Haiku 5.5 on foods and Sonnet 5.5 on package photos. Clef stays the default unless it fails the gates.

**Text model:** compare these on the same cases. Haiku 5.5 is the first choice (owner, 2026-11-05), and Sonnet 5.5 is the step up if Haiku fails on Japanese. The Workers AI models need no new vendor.

| Model | Price per million, in / out | Note |
|---|---|---|
| `claude-haiku-5-5` | $0.10 / $0.50 | First choice; structured output |
| `claude-sonnet-5-5` | $2.00 / $10.00 | Step up; about 20 times the cost |
| `@cf/google/gemma-4-26b-a4b-it` | $0.10 / $0.30 | Listed as 35+ languages |
| `@cf/zai-org/glm-4.7-flash` | $0.06 / $0.40 | Cheapest input |
| `@cf/moonshotai/kimi-k2.7-code` | $0.95 / $4.00 | The only non-deprecated option with JSON schema documented |

**Cost estimate, per review:** about 3,000 Clef tokens is $0.0007, and the Haiku call is about $0.0002. That is about $0.001 per review, or $1 for 1,000 reviews, well inside the $10 monthly target. With Sonnet it is about $0.004 per review. `daily` and `accountDaily` budgets still apply.

**Calibration set, about 120 hand-labelled cases, real names only:**

- **Japanese new foods:** 唐揚げ, 餃子, 牛丼, 親子丼, 焼き鳥, とんかつ, 明太子, ちくわ, かまぼこ, 鰹節, だしの素, カレールー, ツナマヨ, たまごサンド
- **Japanese words for existing foods:** 牛乳, 卵, バター, ベーコン, マヨネーズ, 生クリーム, チーズ, ソーセージ, ハム, ハンバーグ
- **Out of scope (no animal original):** 納豆, 豆腐, こんにゃく
- **Abuse and non-food:** ヴィーガン唐揚げ, グルテンフリーパン, ノート, 安い店, a URL, and a prompt injection in Japanese
- **fr-CA:** Tourtière, Cretons, Pâté chinois, Sauce à poutine, Fromage en grains, Bœuf haché, Lait, Crème glacée, Fromage à la crème, Œufs, Saucisses à déjeuner
- **False friends:** chips, biscuit, カレー
- **Spread:** 12–14 cases each in Korean and German, to expose assumptions before those countries arrive
- **Japanese package photos:** front and ingredient photos with Japanese text go through the existing `submission` and `formula_evidence` questions. The script's six cases are synthetic, for a fictional brand. Add real package photos before trusting a pass. If Clef can't read them, ordinary Japanese products would fall to manual review, even with perfect food review. This is the biggest risk to the Japan launch.

Labels should come from a Japanese speaker where possible. Otherwise, confirm them with two independent sources. The labels in `scripts/calibration/food-review-cases.ts` are a first pass and need this check.

**Gates, per language:**

| Measure | Gate |
|---|---|
| Wrongly accepted food | ≤ 2% |
| Wrongly aliased food | ≤ 1% |
| Claim, spam or injection accepted | 0 |
| Automatically decided | ≥ 70% |
| English gloss usable (human check) | ≥ 90% |

**If a language fails:** AI still writes English context, but auto-accept stays off for that country through a per-country `FOOD_REVIEW` setting. Items go to the queue with the 72-hour deadline. The same setting is the kill switch.

### 6.6 Nothing waits indefinitely

| State | What happens |
|---|---|
| Accepted or aliased | The product continues at once through the existing `foodDecided` path. |
| Needs changes | The contributor fixes it before anything is held. |
| Queued | The product waits at most **72 hours**. |
| 72 hours pass, model leaned yes, safety clean | New hourly step `expiredFoodReviews` accepts it as provisional with reason `timed_default`, flagged in the digest. |
| 72 hours pass, model leaned no or gave no signal | The food is rejected by the system account. A product with other foods publishes with those. A product with none gets the existing follow-up to choose an existing food. |
| Follow-up not answered | Expires under the existing 30-day `reviewRetention`. |
| Provider off | Same deadline with no signal, so the second row of the two above applies. |
| Budget exhausted | Today's retry guidance. Nothing is stored. |

**Conflict to note, not solved here.** Near-duplicate holds and the animal-allergen hold still wait on an operator with no deadline, so Japanese products could stall there. The allergen hold must stay manual. For near-duplicates, this plan adds an English gloss to the queue. Whether they need a deadline is listed in §12.

### 6.7 Provisional, audit, undo and digest

- **Provisional:** `categories.provisional_until`, 30 days after acceptance. Shows a small "New" label, stays out of home features, and scores normally.
- **Audit:** every decision goes through the existing fenced path as `SYSTEM_ACTOR`, with before and after state, input hashes and model IDs. `decideProposal` is split into an `administrator()` entry point and a shared `applyDecision`.
- **Undo for an accepted food:** with no products, it retires the food through the ordinary update and marks the proposal rejected. With products, the digest links to the existing reversible merge in Taxonomy.
- **Undo for an alias:** removes the alias. Any products placed through it stay in that food, listed for the operator, because moving them is a `foods` edit.
- **Reports:** a new `food_reports` table holds reasons `not_a_food`, `duplicate_food`, `wrong_name`, `wrong_aisle` and `other`, one open report per person and food. It's separate from `reports` because that flow is built around a product, and its table can't take a new target without a rebuild. Food pages link to `/report-food`. Open reports show in the digest, new foods first, where an operator marks them handled or dismisses them.
- **Digest:** `/admin/moderation/digest` shows the last seven days, in English: the name as typed, English name, gloss, lane, confidence, and a one-click **Undo**. It also lists timed defaults, aisles opened, proposals nearing the threshold, and counts by country.
- **Queue item:** shows the same English context, and the two choices are the existing Accept, Alias and Reject.

### 6.8 Exact `docs/MODERATION.md` revision

**§18.3:** after "Uncertainty routes to review rather than automatic rejection.", add:

> For suggested foods and aisles, uncertainty routes to review with a deadline (Milestone 8 policy).

**§18.4:** replace the last paragraph with:

> Persist enough model/schema/probability metadata for auditability while avoiding unnecessary raw prompt/model text. The one exception is the English name, gloss, romanized slug, readings and translations a text model writes for a suggested food or aisle. These are stored with the proposal because they are published or shown to reviewers (Milestone 8 policy).

**Milestone 4 policy, Decisions:** replace "Raw prompts and model prose are not stored." with:

> Raw prompts are not stored. Model prose is not stored, except the structured fields named in §18.4.

**Milestone 4 policy, tier table:** in tier 3, replace "category proposals" with "category proposals outside the Milestone 8 policy".

**Milestone 4 policy, Categories:** replace "Proposals are always reviewed by an operator, who may accept, reject or turn the name into an alias of an existing category; reserved route words and near-duplicates are rejected deterministically." with:

> Proposals follow the Milestone 8 policy. An operator may accept, reject or turn a queued name into an alias of an existing category, and may reverse any automatic decision. Reserved route words and near-duplicates are rejected deterministically.

**Milestone 5 policy, Taxonomy and dimensions:** replace "foods and aliases stay unique across the taxonomy" with:

> English food names stay unique across the taxonomy, and a country or language name is unique within its country

**Milestone 6 policy:** replace the first paragraph of "Suggested foods inside a submission" and its "Accept or alias" and "Reject" bullets with:

> **Suggested foods inside a submission.** A submission may suggest one new food (name, language, aisle or new aisle, optional other names) in place of, or beside, existing foods. Preflight applies the standalone suggestion rules: an open country, a valid aisle, a name and other names not already used, reserved words, and the shared daily limit of three suggestions. Finalization evaluates the product and the suggestion under the Milestone 8 policy.
>
> - **Accepted or aliased.** The waiting submission is re-checked with the resolved food. It publishes when nothing else needs review; otherwise it stays in the queue with its remaining reasons. An alias decision also switches the existing food on in the suggestion's country.
> - **Queued.** The submission waits with its food for at most 72 hours, then follows the deadline rule.
> - **Rejected.** A submission with other foods publishes with those. Any other waiting submission receives a follow-up asking its contributor to choose an existing food. The revision follows normal review.

**Milestone 7 policy:** under "What still holds", replace "a suggested food" with "a suggested food in the queue, for at most 72 hours". Replace "Review is otherwise unchanged in this milestone." with "Review follows the Milestone 8 policy."

**Add a new section, before "Owner imports":**

> ## Milestone 8 policy
>
> The [milestone 8 specification](MILESTONE_8_PLAN.md) lets suggested foods and aisles be decided by automated review, so no country depends on an operator who knows its groceries.
>
> **Order of checks.** Deterministic limits and checks and the safety check run first. A text model then writes an English name, gloss, slug, readings and translations. It decides nothing. Its output is validated and passes the safety check before use. Clef then answers finite questions, and the policy engine decides. Reputation, trust, contribution history and payment are never inputs.
>
> **Foods.** A suggestion that is confidently a real conventional food, new to the taxonomy, with no claim in its name, is accepted by the system account as provisional for 30 days. A confident match with an existing food, including a word for it in another language, is added as an alias there. A country accepts at most 20 foods automatically per day; further suggestions wait for the next day. Anything else goes to the review queue with English context. A country can be set to queue-only.
>
> **Aisles.** A proposed aisle never holds a food or product. The food goes in the nearest existing aisle while the aisle gathers demand. It opens after at least three distinct accounts support it, or at least five visible products from at least two accounts sit in its foods, and automated review finds it sensible. Each country has at most six local aisles and one new aisle per week; beyond that the proposal goes to the queue. A proposal with no new support for 180 days closes.
>
> **Deadline.** A queued suggestion is decided by an operator within 72 hours, or the system decides it: accepted as provisional if automated review leaned toward acceptance and safety was clean, otherwise rejected. A submission waiting on a rejected food publishes with its other foods, or receives a follow-up.
>
> **What this path can never do.** It cannot change vegan status, classification, allergen declarations, formulas or any product fact. Those keep their existing rules. A name making a vegan, allergen or health claim is not accepted.
>
> **Audit and reversal.** Every decision uses the fenced, audited path as the system account. An operator can undo any of them from the digest: an accepted food with no products is retired and its name and address are freed, one with products is merged into a chosen food, and an alias is removed. Reports on a food reach the digest.

## 7. Near-duplicate checks (item 4)

Keep the existing rule for spaced scripts. For scripts without spaces, `nameWords` returns character pairs after `foldForMatch`, and the name counts as a near-duplicate when both names share at least 70% of the shorter name's pairs, from the same brand or a containing name.

`nameWords` and `GENERIC_NAME_WORDS` change in checkpoint 4, not checkpoint 1. `GENERIC_NAME_WORDS` gains lists by language (`ヴィーガン`, `プラントベース`, `植物性`, `大豆`, `végétalien`, `sans lait`, `à base de plantes`, and more). They are removed before the comparison. `identityKey` already works on Japanese, because `normalizeName` keeps those characters. The rule moves to `MODERATION.md` under milestone 7's near-duplicate entry, and tests use real pairs (大豆ミートハンバーグ against 大豆ミートボール should not hold).

Brand lookups use trigrams, so a two-character Japanese brand finds nothing. Add an exact prefix match on `brands.normalized_name` for such queries.

## 8. Search (item 10)

Tested in SQLite 3.54.1, in memory, on 15 documents. **This fix stays within D1 FTS5:**

| Query | Now (`unicode61`) | `trigram` | Proposed |
|---|---|---|---|
| 揚げ | none | none | 唐揚げ, 大豆ミートの唐揚げ |
| ごし豆腐 | none | found | found |
| 豆腐 | 豆腐 only | none | 豆腐, 絹ごし豆腐 |
| 牛乳 | found | none | found |
| 餃子 | found | none | found |
| ミルク, ミート | none | found | found |
| 唐揚げ | misses 大豆ミートの唐揚げ | found | found |
| カラアゲ, ｶﾗｱｹﾞ | through a stored alias | through a stored alias | through a stored alias, and any kana form of a stored word |
| creme, glacee | found | none | found |
| oeufs | none | none | needs the œ fold below |

**The fix:** keep `unicode61` and put every character from a spaceless script in a separate token, then search as a phrase.

- Add one column, `segmented`, to `search_index`. The other columns stay untouched, so English search results and rank don't change.
- `SEARCH_INDEX_STATEMENTS` fills it using SQL only: a recursive expression spaces out characters in kana, CJK, Hangul and Thai ranges, and folds katakana to hiragana. Tested in SQLite. D1 parity must be proved in the first checkpoint.
- `searchExpression` keeps Latin tokens as they are. A spaceless run becomes `segmented : "唐 揚 げ"*`.
- A Japanese spelling linked only by reading (唐揚げ and からあげ) needs an alias. The readings from review (§6) supply it. Fold œ in both index and query.
- Name fields from all languages go in `aliases`, so someone on `/ca/fr` who types "milk" still finds it. Search results use the page's language for display.
- `search_index` is a virtual table, so it's replaced in `0001` and rebuilt, not altered.
- **Fallback:** if the SQL is too slow in D1, compute `segmented` in the Worker and write it during the rebuild.

## 9. Translation, UI strings and fonts (item 11)

**UI string inventory, from a parse of `app/`:**

| Type | Unique strings | Words |
|---|---|---|
| JSX text | 830 | 5,278 |
| Text attributes (labels, placeholders) | 82 | 219 |
| Text in expressions | 199 | 527 |
| `ApplicationError` messages | 261 | not counted |

Non-JSX strings (meta titles, label arrays, Zod messages, date and number formats) were not counted. `en-US` is hard-coded in `format.ts`, `community.ts` and `my-ratings.tsx`, and `<html lang="en">` in `root.tsx` and `security.ts`.

**Order of extraction:**

| Slice | Contents | Needed for |
|---|---|---|
| S1 | Header, browse, food, product, search, ratings, comments | Any public language |
| S2 | Add product, suggest food, contribute, contributions | Any public language, because people must be able to add |
| S3 | Account, my ratings, saved | Any public language |
| S4 | Policies (`app/content/policies.tsx`) | Deferred, English for now |
| Stays English | `admin-taxonomy`, `moderation`, `admin-analytics` (about 220 nodes) | Operators only |

**Built at checkpoint 6.** Slices S1 to S3 moved to `app/i18n/en/`, about 1,200 keys. `t()` reads the page's language the way `homePath` does, so text works outside React and a language with no dictionary shows English. All JavaScript grew 66 KB, or 14 KB compressed, from 841 KB and 248 KB, because the English text now ships in the shared `page-shell` chunk on every page. The account's `preferred_language` is deferred until a language is live. Server text such as `ApplicationError` messages and allergen summaries stays English until checkpoint 7.

**French built at checkpoint 7.** The dictionary is `app/i18n/fr/`, and `market-sensitive.json` lists what to check when France launches. A second market of a language adds an override file with only its differences, not a second translation. Pages with no language in their address follow the `va_lang` cookie, except pages cached for everyone. Canada's `offered` list doesn't include `fr` yet; `docs/operations/translation-glossary.md` says what decides that. Results are in `docs/verification/milestone-8.md`.

**Japanese built at checkpoint 8.** The dictionary is `app/i18n/ja/`. Japan's `offered` list stays English for now, under the same rule. Stores come from contributors, with none seeded (owner, 2026-11-06). Results are in `docs/verification/milestone-8.md`.

**Market overrides.** `t()`, server messages, dates and allergen names check the page's country first, then the shared language. A language passes its countries to `addDictionary`, each with its locale and only its differences. French has one shared override for Europe, because the shared `fr` is Canadian. Food names use the existing country and language rows in `category_aliases`.

**Mechanics, with no new dependency:** `app/i18n/en.ts`, `fr.ts` and `ja.ts`, typed so a missing key fails `tsc`, plus about 40 lines of `t()` using `Intl.PluralRules`. English stays in the main bundle. Other languages are one chunk loaded before hydration, chosen from `<html lang>`. API errors keep `message` and gain a client map from `code` to text, so `/api/v1` doesn't change. Dates and numbers use the page language.

**Translation:**

- Translation is done by Claude at development time, not at runtime, using a glossary in `docs/operations/translation-glossary.md`. The glossary fixes product words such as Closest to the original, Tastiest, aisle and each vegan status.
- **Safety strings get an independent check.** These are allergen names and "may contain" wording, every vegan status label, "Ingredients not checked yet", and "Always check the package". There are no native reviewers (owner, 2026-11-06). An evaluator that didn't translate them back-translates them blind, and user reports through `/report-translation` catch what remains. The glossary lists what must hold before a language leaves preview.
- Japan's allergen list must use the official Consumer Affairs Agency terms, and Canada's French must use Health Canada's. Check both at build time. A language can't be listed in `offered` until this passes. EU markets use the words of Regulation 1169/2011 Annex II, and Switzerland uses the FSVO's.

**Food and aisle names:** the 23 aisles and current foods get fr and ja names, added to the seed by the same method. A country with different words adds rows of its own.

**What stays as written (owner, 2026-11-06):** the interface, food and aisle names, allergens, countries and server messages are translated. Product names, brand names, comments and ingredients aren't. Ingredients show as printed, because an automatic translation could hide an allergen. The per-product translation tables planned here are dropped.

**Fonts:** ship no Japanese web font. Add `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans CJK JP"` to `--va-font` in `app/styles/tokens.css`, before `sans-serif`. This adds zero bytes and causes no layout shift. Archivo's `unicode-range` already sends Japanese characters to the next font in the list. A web font would cost much more: searches found full CJK fonts in the megabytes, though I found no measured figure for slices, so check that only if the system font test fails.

Add `:lang(ja)` rules: taller line height, no letter spacing, and `word-break: auto-phrase`.

## 10. Schema summary

All of this folds into `db/migrations/0001_initial.sql`, per the version 1 rule.

| Table | Change |
|---|---|
| `category_aliases` | Add `language`; new display index; amended triggers |
| `categories` | Add `origin_country_id`, `provisional_until` |
| `category_proposals` | Add `review` (JSON) |
| `aisle_proposals` | New: one row per asked-for aisle in a country |
| `aisle_proposal_foods` | New: the foods, and so the accounts, behind each proposal |
| `profiles` | Add `preferred_language` |
| `products` | Add `name_language` |
| `product_name_translations` | New, in the last checkpoint |
| `search_index` | Recreated with `segmented` |
| `food_reports` | New: reports on a food |
| `moderation_decisions` | Schema version 3; `aisle_review` kind if the check needs it |

**Japan activation needs:** a `countries` row, Japan's declared-allergen list (including new keys such as buckwheat), and a starter store list. Allergen terms use the Consumer Affairs Agency's wording.

## 11. Build order

Each checkpoint runs `npm run check` and the affected Playwright specs. Per the e2e rules: no edits during a run, stop the preview server first, and write screenshots only to `test-results/captures`. Nothing is committed or pushed without the owner's request.

| # | Work | Done when |
|---|---|---|
| 0 | **Calibrate.** Run §6.5 and choose models. | Results in `docs/verification/milestone-8.md`; gates passed or the country set to queue-only |
| 1 | **Docs and text helpers.** Doc revisions from §3, §4.4 and §6.8. Add `text.ts` and the fallback slugs. | Taxonomy keys unchanged for all seed names; Japanese and French unit tests pass |
| 2 | **Language plumbing.** Schema, `languages.ts`, routes, `publicRoute`, cache identity, memo keys, country-limited purges, `displayName`, `hreflang`, sitemap. Still English only, with `fr` and `ja` on `PREVIEW` only. | Existing URLs unchanged; `verify-cache-staging.ts` extended and passing |
| 3 | **Search.** `segmented`, query changes, and the D1 parity and rebuild-time check. | §8 table passes in D1; English result order unchanged |
| 4 | **AI review.** Services, decisions, deadline, undo, reports, digest, near-duplicates. | Works in English and in Japanese with a fake provider, then real Clef on staging |
| 5 | **Aisle suggestions.** UI, contracts, gathering, opening, cap. | A product never waits on an aisle, shown by test |
| 6 | **Interface.** Extract S1 to S3 to English dictionaries, add font stack, switcher, cookie and prompt. | Visual tests unchanged in English; bundle growth recorded |
| 7 | **French.** `fr.ts`, names, independent evaluation. Add `fr` to Canada's `offered`. | `/ca/fr` live on staging; hreflang and axe pass |
| 8 | **Japan.** `ja.ts`, names, independent evaluation, allergens, country activation. | `/jp` in Japanese, `/jp/en` in English, a Japanese food suggested through to a published product |
| 9 | **Product name translations.** Dropped (owner, 2026-11-06). | None |

Checkpoints 3, 4 and 5 can run beside 6. AI review (4) is useful even before any new language, because it removes the operator wait in English countries.

**Deferred:**

- Other countries beyond those the owner listed, Thai and Hindi. Arabic and Hebrew are dropped (owner, 2026-11-06).
- Translated policy pages (legal text needs a person)
- Translating comments, or recording a comment's language
- Translated `/users/*` pages
- Near-duplicate AI review
- Translating report text in the queue
- Email digest, if not chosen in §12
- Contributor trust

## 12. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Change the universal-aisle rule as in §3 | Yes |
| 2 | Allow a language cookie as the one exception to "never in cookies" | Yes |
| 3 | Approve model calibration spend, capped at $1 | Yes |
| 4 | Deadline of 72 hours with the timed default in §6.6 | Yes. The alternative is a contributor follow-up for every expired item. |
| 5 | Aisle demand: 3 people or 5 products; cap of 6 per country | Yes, review after Japan's first month |
| 6 | Staging schema: full reset under the version 1 rule, or one more one-time exception | One more exception: additive statements plus an FTS rebuild, so the reviewed catalog isn't reset and re-imported. This would add a fourth exception to `AGENTS.md`. |
| 7 | Pay a native reviewer for fr-CA and ja safety strings | Decided no (owner, 2026-11-06). User reports replace native review; see the glossary. |
| 8 | Digest delivery | Start with the admin page. A daily email through Cloudflare's `send_email` binding needs Email Routing set up. |
| 9 | Should near-duplicate holds also get a deadline? | Decide after calibration. For now they keep the operator hold with an English gloss. |
| 10 | Canada defaults to English, with French at `/ca/fr` | Yes. Quebec visitors get the one-time language prompt. Take legal advice before a Quebec launch. |
| 11 | Turn on `MODERATION_PROVIDER` and the safety provider in production before launch | Required for AI review. |

## 13. Documentation conflicts to resolve in checkpoint 1

- `docs/PRODUCT_MASTER.md` line 1324 and `docs/MILESTONE_7_PLAN.md` (lines 157 and 820) say the site stays English and a language setting defaults to English. Replace with this plan.
- `docs/MILESTONE_7_PLAN.md` line 832 says aisle proposals are "reviewed by an operator", and the milestone 8 proposal says "Milestone 8 decides how" for lighter food review. This plan decides both.
- `docs/PRODUCT_MASTER.md` §04, "nothing is inferred from IP". The language prompt reads the browser's language, not IP, so the rule stands.
- `docs/ARCHITECTURE.md` §15 and §20 (rule 1): the text model is a new use of the existing Workers AI binding, so document it in an ADR in `docs/TECH_STACK.md`. Correct the Clef price and context window there too.
- `docs/DATABASE_BASELINE.md` line 112 mentions a default locale on countries. Replace it with a pointer to `languages.ts`.
- `docs/API.md`: add `language` and `PUT /me/language` in checkpoint 2, and the `category` report target in checkpoint 4, when each exists.
- Update `AGENTS.md`'s read-first list and its milestone 7 paragraph.

## 14. Verification

**Unit**

- Slug, key and fold on Japanese, French and all seed names
- `parsePublicPath` for every URL shape in §4.2, including `/ca/fr` against a food slug
- `languageFor`
- Near-duplicate pairs
- `searchExpression` and the policy lanes at each threshold
- Provider output failures

**Integration, local D1**

- `search_index` against the §8 table
- Display-name fallback order
- Food accept, alias and queue, each with its audit row
- The 72-hour step through each branch
- Undo with and without products
- Aisle demand counts, with duplicate accounts refused
- The cap
- A test that review cannot write classification or allergen tables
- A test that the model state has no account fields

**Cache** (`tests/remote-cache`, `scripts/verify-cache-staging.ts`)

- `/ca` and `/ca/fr` cache separately
- One purge clears both
- A cookie never reaches the renderer
- A redirect is `no-store` with no D1 read
- A one-country food change leaves other countries cached

**Playwright**

- Switch language with and without JavaScript
- A cookie redirects `/jp` to `/jp/en`, while `/jp/en` never redirects
- Suggest 唐揚げ through to publication with a fake provider
- "None of these fit"
- Undo from the digest
- Search 揚げ
- Axe on `/ca/fr` and `/jp`
- Visual checks in Japanese on iOS, Android and Windows sizes
- The layout-shift spec

**Staging, with real providers:** a Japanese and a French suggestion from two accounts, with decision rows checked. Record page speed against the baseline in the page speed notes.

## Sources

- [Clef-flash model page](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
- [Clef model page](https://developers.cloudflare.com/workers-ai/models/clef/)
- [Clef launch post](https://blog.cloudflare.com/clef-decision-models/)
- [Workers AI changelog](https://developers.cloudflare.com/changelog/product/workers-ai/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Google: localized versions of a page](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [CJK web font sizes, rough figures only](https://unicodefyi.com/ja/glossary/web-fonts)
