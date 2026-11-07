# Translation glossary

Every language shares these rules. Each language has its own term list below, decided before translation. The process is the `product-multilingual` skill: a separate agent scores the work, and high-stakes strings are translated back and compared.

## High-stakes strings

Keys starting `safety.` or `allergen.`, and any key naming a vegan status, an allergen or "not checked". An independent evaluator translates these back without seeing the English, for each market, and any lost meaning is fixed before a language leaves preview. Reusing text from another market of the same language doesn't count as checked.

## Who checks a translation

There are no native reviewers (owner, 2026-11-06). Problems come from user reports: translated pages link to `/report-translation`, and open reports appear in `/admin/moderation/digest`. A report on a high-stakes string is fixed before other translation work.

A market leaves preview when the owner moves its language from `preview` to `offered` in `server/catalog/domain/languages.ts`. The owner does that once all of these hold for that market:

1. `check_catalog.py` passes for the dictionary and server messages, with every kept-English string explained.
2. An evaluator that didn't translate has reviewed the whole catalog and back-translated every high-stakes key.
3. A second evaluator has rechecked after the fixes, and no critical or high finding is open.
4. Allergen names match the country's official wording, with sources cited here.
5. The market's browser tests, type checks and unit tests pass, and `/report-translation` works in that language.

Evaluator scores show what was checked. They don't stand in for a native reader, so report them as provisional.

## Dictionaries

`app/i18n/en/` is the source. A language has one shared dictionary, such as `app/i18n/fr/`. A second market of that language adds an override file holding only its differences, and `app/i18n/fr/market-sensitive.json` lists the keys to check when it does.

## Canadian French (fr-CA)

| English | French | Why |
|---|---|---|
| vegan | végane, one form for every gender | The OQLF's recommended term |
| swap | substitut | Same word everywhere |
| Closest to the original | Le plus proche de l’original | A ranking name, never reworded |
| Tastiest | Le plus savoureux | A ranking name, never reworded |
| ranked | classé | |
| rating | évaluation | |
| member | membre | |
| aisle, category | catégorie | |
| food | aliment | |
| plant-based | à base de plantes | |
| Contains | Contient | Canadian label wording |
| May contain | Peut contenir | Canadian label wording |
| email | courriel | |
| alternative | solution de rechange | Headings and marketing copy |
| score | note | The number shown |
| review | examen | Staff checking, never `révision` |
| submission | soumission | |
| rate, rating (verb) | évaluer | Members only; staff `examinent` |
| operator | l’équipe | |
| flavor | saveur | |
| product line | gamme | |
| recipe, formula | recette, formule | |
| retailer, store | détaillant, magasin | |
| #1 | no 1 | With a non-breaking space |

- Address the reader as `vous`.
- Spacing follows the OQLF: a non-breaking space before `:` and inside « », and no space before `;`, `?` or `!`.
- `{food}` and `{detail}` are filled at runtime with bare lowercase names, so a sentence can't give them an article or a contraction. Write `pour « {food} »`, and don't write `le {food}` or `du {food}`.

`{country}` is a bare name, so a sentence can't give it a preposition. Write `dans ce pays ({country})`.

Sources: [OQLF, spacing](https://vitrinelinguistique.oqlf.gouv.qc.ca/22039/la-typographie/espacement/espacement-avant-et-apres-les-signes-de-ponctuation-et-les-symboles), [OQLF, végane](https://vitrinelinguistique.oqlf.gouv.qc.ca/fiche-gdt/fiche/26570818/vegane), [CFIA, allergen labelling](https://inspection.canada.ca/fr/etiquetage-aliment/etiquetage/industrie/comment-etiqueter-allergenes).

## Japanese (ja-JP)

| English | Japanese | Why |
|---|---|---|
| vegan | ヴィーガン | The word in JAS and on packaging |
| swap | 代替品 | Same word everywhere |
| alternative | 代替品 | |
| plant-based | プラントベース | Reads as a marketing term, not a guarantee |
| Closest to the original | 本物に近い順 | A ranking name, never reworded |
| Tastiest | おいしい順 | A ranking name, never reworded |
| food | 食品 | |
| aisle, category | カテゴリー | |
| rating | 評価 | |
| score | スコア | |
| member | メンバー | |
| review (staff) | 確認 | |
| submission | 投稿 | |
| flavor | フレーバー | |
| recipe, formula | レシピ | |
| retailer, store | 販売店、店舗 | |
| allergen | アレルゲン | |
| Contains | 含む | `〜を含む`, as on labels |
| May contain | 含まれている可能性あり | Not the label's own wording; see below |
| ingredients | 原材料 | |
| email | メールアドレス | |
| product | 商品 | |
| product line | シリーズ | |
| sign in | ログイン | |
| operator | 運営 | |
| moderator | モデレーター | |
| Free from | アレルゲンで絞り込み | Never `〜を含まない`, which reads as our guarantee |

- Use です・ます, and plain noun labels for buttons and headings. No exclamation marks.
- `一部に〜を含む` and the 特定原材料 item names are official wording. Use the Consumer Affairs Agency's item names exactly: 乳 not 牛乳, 落花生 not ピーナッツ, えび, かに.
- Japanese labels aren't allowed to say an allergen "may be in" a product (`入っているかもしれない`). They warn instead, in the form `同一の製造ラインで〜を含む製品を製造しています`. So our "May contain" text describes what a label warned about, and must never read as our own judgement.
- A plant-based food isn't meat. The Consumer Affairs Agency treats 肉 and 卵 in a plant-based product's name as a labelling risk, so don't write 大豆肉 as if it were a kind of meat in our own copy.
- No spaces between Japanese and numbers or placeholders, except Latin words where it reads better.
- Japanese has no plural. Plural entries keep `one` and `other` with the same text.
- Sentence order differs from English. When a string joins around a link, write the joined sentence first, then split it, and leave a piece empty if it has no words.

Sources: [Consumer Affairs Agency, allergen labelling](https://www.caa.go.jp/policies/policy/food_labeling/food_sanitation/allergy/), [Kyoto Prefecture, current 9 + 20 items](https://www.pref.kyoto.jp/shoku-kawaraban/allergie01.html), [Consumer Affairs Agency, plant-based labelling Q&A](https://www.caa.go.jp/notice/other/plant_based/).
