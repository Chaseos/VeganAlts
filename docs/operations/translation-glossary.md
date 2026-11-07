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

## EU and Swiss rules for every European market

- **Allergen names** use the head words of Regulation 1169/2011 Annex II in each language. Switzerland has the same 14 groups in LIV Annex 6, with its own wording where listed below.
- **"May contain"** is voluntary in the EU (Regulation 1169/2011 art. 36). In Switzerland it's required above set amounts, 1 g/kg for most allergens (LIV art. 11). So our text describes what a label says and never promises that a label will warn.
- **Reserved meat words.** Regulation (EU) 2026/1739 reserves "meat" and 31 terms from 19 August 2029, including steak, bacon, chicken, beef, pork, filet, ribs and liver, for meat. `burger`, `sausage` and `nugget` aren't on the list. Switzerland's Federal Supreme Court (2C_26/2023) ruled that animal species names mislead on plant products, such as "Poulet".
- **Reserved dairy words.** Milk, cream, butter, cheese and yogurt are reserved for dairy, even with a word like "plant" beside them (CJEU C-422/16). Coconut milk, peanut butter and cocoa butter are among the listed exceptions.
- **In our own copy**, a food name is the animal food a product replaces, never the product. Write "alternatives to milk", and never call a product "vegan milk", "plant steak" or "plant meat" in the site's own voice. Food and aisle names stay the plain names of the original foods. Brand and product names stay as written.
- **Sentence patterns.** Don't put "vegan" directly before `{food}`. Use the language's form of "vegan alternatives to `{food}`".

## German (de-DE, de-AT, de-CH, de-LU)

| English | German | Why |
|---|---|---|
| vegan | vegan | |
| swap, alternative | Alternative | Same word everywhere |
| plant-based | pflanzlich | |
| Closest to the original | Am nächsten am Original | A ranking name, never reworded |
| Tastiest | Am leckersten | A ranking name, never reworded |
| ranked | gelistet, in der Rangliste | |
| rating | Bewertung | |
| rate | bewerten | Members only; staff `prüfen` |
| score | Punktzahl | `Note` reads as a school grade, where 1 is best |
| member | Mitglied | |
| aisle, category | Kategorie | |
| food | Lebensmittel | |
| Contains | Enthält | Label wording |
| May contain | Kann enthalten | LIV art. 11: `kann Erdnüsse enthalten` |
| Free from | Ohne | Only with "laut Etikett" nearby where space allows, never as our guarantee |
| ingredients | Zutaten | |
| allergen | Allergen | |
| email | E-Mail | |
| review (staff) | Prüfung | |
| submission | Einreichung | |
| flavor | Sorte | |
| product line | Produktlinie | |
| recipe, formula | Rezeptur | |
| retailer, store | Händler, Geschäft | |
| sign in | anmelden | |
| operator | das Team | Avoids a gendered role noun |
| plant drink | Pflanzendrink | Never `Pflanzenmilch` in our own copy |
| #1 | Platz 1 | |

- Address the reader as `du`, like vegan brands and community sites in German. Capitalize `Du` only at the start of a sentence.
- Avoid gender stars. Rephrase with neutral words such as `Mitglieder`, `Team`, `Personen`.
- Quotes are „so“. Swiss pages turn them into «so» and ß into ss automatically, so write German, not Swiss, spelling.
- `{food}` and `{country}` are bare names with no article, and `{food}` keeps its capital. Write `Alternativen zu {food}`. Never put an adjective or article before `{food}`. Write `in diesem Land ({country})`, because `in {country}` breaks for die Schweiz.
- Spelling is reformed German. Numbers and dates come from the locale.
- Austrian and Swiss food words are country rows on the seed, such as Obers and Rahm, and differ only there.

Allergens: Glutenhaltiges Getreide, Krebstiere, Eier, Fische, Erdnüsse, Sojabohnen, Milch, Schalenfrüchte, Sellerie, Senf, Sesamsamen, Schwefeldioxid und Sulphite (Sulfite in Switzerland), Lupinen, Weichtiere.

## Italian (it-IT, it-CH)

| English | Italian | Why |
|---|---|---|
| vegan | vegano, vegana | Agrees with its noun |
| swap, alternative | alternativa | Same word everywhere |
| plant-based | vegetale | |
| Closest to the original | Il più vicino all’originale | A ranking name, never reworded |
| Tastiest | Il più gustoso | A ranking name, never reworded |
| ranked | in classifica | |
| rating | valutazione | |
| rate | valutare | Members only; staff `verificano` |
| score | punteggio | |
| member | membro | |
| aisle, category | categoria | |
| food | alimento | |
| Contains | Contiene | Label wording |
| May contain | Può contenere | LIV art. 11: `può contenere arachidi` |
| Free from | Senza | With "secondo l’etichetta" where space allows, never as our guarantee |
| ingredients | ingredienti | |
| allergen | allergene | |
| email | e-mail | |
| review (staff) | verifica | |
| submission | proposta | |
| flavor | gusto | |
| product line | linea | |
| recipe, formula | ricetta | |
| retailer, store | rivenditore, negozio | |
| sign in | accedi | |
| operator | il team | |
| plant drink | bevanda vegetale | Never `latte vegetale` in our own copy |
| #1 | n. 1 | |

- Address the reader as `tu`. Buttons use the imperative.
- Avoid gendered role nouns: `chi ha aggiunto`, `le persone`.
- Quotes are «così». Apostrophes are ’.
- `{food}` and `{country}` are bare lowercase or proper names with no article. Write `alternative a {food}`, and don't write `al {food}` or `del {food}`. Write `in questo paese ({country})`, because the right preposition changes by country.

Allergens: Cereali contenenti glutine, Crostacei, Uova, Pesce, Arachidi, Soia, Latte, Frutta a guscio, Sedano, Senape, Semi di sesamo, Anidride solforosa e solfiti, Lupini, Molluschi.

## European French (fr-FR, fr-BE, fr-LU, fr-CH)

`app/i18n/fr/france.ts` holds only what differs from the shared Canadian text, and all four countries use it.

| English | Canadian | European | Why |
|---|---|---|---|
| vegan | végane, one form | végan, végane, agreeing with the noun | Usual in France; Swiss law also accepts `vegan` |
| swap, alternative | substitut, solution de rechange | alternative | Usual in France |
| email | courriel | e-mail | |
| soy | soya | soja | Annex II |
| tree nuts | noix | fruits à coque | Annex II. Swiss group term is `fruits à coque dure` |
| submission | soumission | proposition | |
| retailer | détaillant | enseigne, distributeur | |
| breakfast | déjeuner | petit-déjeuner | `déjeuner` is lunch in France |
| ice cream | crème glacée | glace | |
| #1 | no 1 | n° 1 | |
| plant drink | | boisson végétale | Never `lait végétal` in our own copy |

- Ranking names don't change: Le plus proche de l’original, Le plus savoureux.
- Spacing is the French rule, a non-breaking space before `; : ! ?` and inside « ». Code adds it to every shared string, so the override doesn't list a key for spacing alone.

Allergens: Céréales contenant du gluten, Crustacés, Œufs, Poissons, Arachides, Soja, Lait, Fruits à coque, Céleri, Moutarde, Graines de sésame, Anhydride sulfureux et sulfites, Lupin, Mollusques.

Sources: [Regulation 1169/2011, de](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02011R1169-20180101), [fr](https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:02011R1169-20180101), [it](https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:02011R1169-20180101), [Regulation (EU) 2026/1739](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R1739), [Swiss LIV, SR 817.022.16](https://www.fedlex.admin.ch/eli/cc/2017/158/de), [Decision 2010/791/EU](https://eur-lex.europa.eu/eli/dec/2010/791/oj), [Planted ruling, reported by SRF](https://www.srf.ch/news/wirtschaft/bundesgericht-zu-planted-fleischersatz-darf-keine-tiernamen-enthalten-die-uebersicht), [CJEU C-422/16 press release](https://curia.europa.eu/jcms/upload/docs/application/pdf/2017-06/cp170063en.pdf).

Not read at an official source: the Swiss judgment itself, the Annex VII Part III text of Regulation 1308/2013, the German Leitsätze, and French spacing, which follows common French practice. Italy's Law 172/2023 art. 3 limits meat names on labels; its enforcement today is unclear, and the rule above is stricter than it.
