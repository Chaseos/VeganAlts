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
| moderator | Moderationsteam | Avoids a gendered role noun |
| #1 | Platz 1 | |

- Address the reader as `du`, like vegan brands and community sites in German. Capitalize `Du` only at the start of a sentence.
- Avoid gender stars. Rephrase with neutral words such as `Mitglieder`, `Team`, `Personen`.
- Quotes are „so“. Swiss pages turn them into «so» and ß into ss automatically, so write German, not Swiss, spelling.
- `{food}` and `{country}` are bare nominative names with no article, and `{food}` keeps its capital. It can't take a case ending, so never put a preposition that changes its case before it (`zu {food}`, `für {food}`). Write `Vegane Alternativen: {food}`, or put it in parentheses, `dem Original ({food})`. Never put an adjective or article before `{food}`. Write `{inCountry}` for "in Germany", and `{country}` only for a bare name. Food names are stored so they stay correct unchanged, such as `Joghurt nach griechischer Art`, not `Griechischer Joghurt`.
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
| brand | marca | |
| community | community | |
| Commonly found at | Si trova di solito da | |
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
## Spanish (`es`: Mexico base, es-MX; Spain override, es-ES)

The shared dictionary is Mexican Spanish. `app/i18n/es/spain.ts` holds only what Spain changes.

| English | Mexico | Spain | Why |
|---|---|---|---|
| vegan | vegano, vegana | same | Agrees in gender. No legal definition in either market |
| swap, alternative | alternativa | same | Same word everywhere |
| plant-based | a base de plantas | de origen vegetal | Spain's own sector wording. Marketing wording, not a guarantee |
| Closest to the original | Más parecido al original | same | A ranking name, never reworded |
| Tastiest | Más sabroso | same | A ranking name, never reworded |
| food | alimento | same | Both rules say `alimento` |
| aisle, category | categoría | same | |
| rating, to rate | calificación, calificar | valoración, valorar | Regional usage. Members only |
| score | puntuación | same | The number shown |
| member | miembro | same | |
| review (staff), to review | revisión, revisar | same | Never `reseña`, which is a customer's text |
| submission | envío | same | |
| flavor | sabor | same | |
| recipe, formula | receta, fórmula | same | |
| product line | línea | gama | |
| retailer, store | tienda | same | |
| allergen | alérgeno | same | |
| Contains | Contiene | same | NOM-051 4.2.2.2.3 b; EU 1169/2011 art. 21 |
| May contain | Puede contener | same | NOM-051 4.2.2.2.3 c; voluntary in the EU, art. 36 |
| ingredients | ingredientes | same | |
| email | correo electrónico | same | |
| sign in | iniciar sesión | same | |
| operator | el equipo | same | |
| moderator | moderador | same | |
| phone | celular | móvil | |
| add | agregar | añadir | |
| report (a problem) | reportar | denunciar, informar de | |
| package | empaque | envase | |
| #1 | #1 | n.º 1 | |

- Address the reader as `tú`, with no `vos` or `vosotros`.
- Spain uses the present perfect for what just happened: `No se ha podido`, where Mexico writes `No se pudo`.
- Quotation marks are “ ”. Sentences keep their opening `¿` and `¡`, and there are no exclamation marks in product copy.
- `{food}` and `{detail}` are bare lowercase names of unknown gender, and `{country}` is a bare name. Write `para “{food}”` and `en este país ({country})`, and never `el {food}` or `del {food}`.
- Mexico's allergens are the 10 entries of NOM-051 4.2.2.2.3 a, in its words: Cacahuate, Soya, Nueces de árboles, Sulfito. It doesn't list sesame, celery, mustard or lupin. A Mexican label states `Contiene:` at the end of the ingredients. `Puede contener` is required when contamination is possible.
- Spain's are the 14 groups of EU 1169/2011 Annex II, in its Spanish: Cacahuetes, Soja, Frutos de cáscara, Altramuces, Granos de sésamo, Dióxido de azufre y sulfitos. An EU label usually highlights an allergen inside the ingredients, and says `contiene` only when there's no list. So copy mustn't tell a Spanish reader to look for a `Contiene` line.
- Our copy never calls a product `leche vegetal`, `queso vegano` or `carne vegetal`. Write `alternativa a la leche`, or `bebida vegetal` for a drink. EU 1308/2013 Annex VII reserves dairy names and TofuTown (C-422/16) applies them to plant products; Spain's only listed exception is `leche de almendras`. Mexico's NOM-155 defines `leche` as cow's milk. Food page names such as `Leche` name what is being replaced, not the product.
- EU 2026/1739 reserves 31 meat terms from 19 August 2029. `burger` and `sausage` aren't among them.
- Mexico's `IMITACIÓN` (NOM-051 4.2.1.1) is a label term, so our copy doesn't use it.
- `Free from` is a filter on what labels declare, and it also shows on result cards. Write `Etiqueta (alérgenos):` and `no declara {name}`, never a bare `sin {name}`.
- The taste score is `sabor`. `Commonly found at` is `Se encuentra comúnmente en`, one wording everywhere, and it's never live stock.

Sources: [NOM-051, DOF 27/03/2020](https://dof.gob.mx/2020/SEECO/NOM_051.pdf), [EU 1169/2011 in Spanish](https://www.boe.es/doue/2011/304/L00018-00063.pdf), [EU 1308/2013](https://www.boe.es/doue/2013/347/L00671-00854.pdf), [TofuTown](https://curia.europa.eu/jcms/upload/docs/application/pdf/2017-06/cp170063es.pdf), [Decision 2010/791](https://www.boe.es/doue/2010/336/L00055-00059.pdf), [NOM-155](https://platiica.economia.gob.mx/normalizacion/wp-content/uploads/sites/2/PDF_Normas_Publicas/155scfi2012.pdf). Each opened 2026-11-06; the EU texts are the original Official Journal versions, because EUR-Lex couldn't be opened. Not confirmed: that NOM-051 has no later change to this list, and the wording of AESAN's 2025 precautionary-labelling procedure, whose PDF wouldn't open.

## Portuguese (`pt`: Brazil base, pt-BR; Portugal override, pt-PT)

The shared dictionary is Brazilian Portuguese. `app/i18n/pt/portugal.ts` holds only what Portugal changes.

| English | Brazil | Portugal | Why |
|---|---|---|---|
| vegan | vegano, vegana | same | Agrees in gender. No legal definition found in either market |
| swap, alternative | alternativa | same | Same word everywhere. Never `análogo`, a term in MAPA's drafts |
| plant-based | à base de plantas | same | |
| Closest to the original | Mais parecido com o original | Mais parecido ao original | A ranking name, never reworded |
| Tastiest | Mais saboroso | same | A ranking name, never reworded |
| food | alimento | same | |
| aisle, category | categoria | same | |
| rating, to rate | avaliação, avaliar | same | Members only |
| score | nota | pontuação | |
| member | membro | same | |
| review (staff), to review | revisão, revisar | revisão, rever | Staff checking |
| submission | envio | same | |
| flavor | sabor | same | |
| recipe, formula | receita, fórmula | same | |
| product line | linha | gama | |
| retailer, store | varejista, loja | retalhista, loja | |
| allergen | alérgeno | alergénio | Each market's own spelling |
| Contains | Contém | same | RDC 727 art. 13; EU 1169/2011 art. 21 |
| May contain | Pode conter | same | RDC 727 art. 14; voluntary in the EU, art. 36 |
| ingredients | ingredientes | same | |
| email | e-mail | same | |
| sign in | entrar | iniciar sessão | Microsoft's style guides |
| password | senha | palavra-passe | Microsoft's style guides |
| screen | tela | ecrã | Microsoft's style guides |
| file | arquivo | ficheiro | Microsoft's style guides |
| user | usuário | utilizador | Microsoft's style guides |
| share | compartilhar | partilhar | Microsoft's style guides |
| upload | enviar | carregar | |
| manage | gerenciar | gerir | |
| team (operator) | a equipe | a equipa | |
| moderator | moderador | same | |
| #1 | nº 1 | n.º 1 | |

- Brazil addresses the reader as `você`.
- Portugal avoids `você`. Use the third-person imperative (`Adicione`), `o seu`, or rephrase, following Microsoft's pt-PT guide. Use `estar a` + infinitive, never the gerund for an action in progress. Spelling follows AO90.
- Quotation marks are “ ”, and there are no exclamation marks in product copy.
- `{food}` and `{detail}` are bare lowercase names of unknown gender, and `{country}` is a bare name. Write `para “{food}”` and `neste país ({country})`, and never `o {food}` or `do {food}`.
- Brazil's allergens are the 18 entries of RDC 727 Annex III, split wheat, rye, barley and oats, plus gluten for the separate `CONTÉM GLÚTEN` statement of Law 10.674. Labels print `ALÉRGICOS: CONTÉM …` and `ALÉRGICOS: PODE CONTER …`. `Pode conter` is required when cross-contact can't be ruled out, and must rest on an allergen control programme. Lactose is a separate statement (`CONTÉM LACTOSE`), not this list.
- **Brazil's wording is under revision.** Anvisa's CP 1.357/2025 would drop the `ALÉRGICOS:` lead-in and add celery, sesame, mustard, lupin and buckwheat, with a `Contém sulfito` warning. Comments closed 9 March 2026, and no final act was found by 2026-11-06. So our copy says `Contém` without the lead-in, and the list must be rechecked when the act is published.
- **PL 1030/2026** would reserve `leite`, `carne`, `queijo` and honey terms for animal products. It went to the Senate's agriculture committee and hasn't moved since 19 March 2026, so it isn't law. Our copy already avoids those names for products.
- Portugal's allergens are the 14 groups of EU 1169/2011 Annex II, in its Portuguese: Amendoins, Frutos de casca rija, Tremoço, Sementes de sésamo, Dióxido de enxofre e sulfitos, Aipo. An EU label usually highlights an allergen inside the ingredients, so copy mustn't tell a reader to look for a `Contém` line.
- Our copy never calls a product `leite vegetal`, `queijo vegano` or `carne vegetal`. Write `alternativa ao leite`, or `bebida vegetal` for a drink. Food page names such as `Leite` name what is being replaced.
- `Free from` is a filter on what labels declare, and it also shows on result cards. Write `rótulo sem {name}`, never a bare `sem {name}`. Anvisa's draft would also bar claims that an allergen is absent.
- The taste score is `nota de sabor`, because `sabor` alone is the flavor. `Commonly found at` is `Costuma ser encontrado em`, one wording everywhere, and it's never live stock.
- Evidence is `evidência`, never `comprovação`, which claims proof.

Sources: [RDC 727/2022 (reproduction; the DOU prevails)](https://www.boaconta.com.br/legislacao/rdc-727-2022/), [CP 1.357/2025](https://anexosportal.datalegis.net/arquivos/1923310.pdf), [Law 10.674/2003](https://www2.camara.leg.br/legin/fed/lei/2003/lei-10674-16-maio-2003-496699-publicacaooriginal-1-pl.html), [PL 1030/2026](https://www25.senado.leg.br/web/atividade/materias/-/materia/172970), [EU 1169/2011 in Portuguese](http://publications.europa.eu/resource/celex/32011R1169), [EU 1308/2013](http://publications.europa.eu/resource/celex/32013R1308), [EU 2026/1739](http://publications.europa.eu/resource/celex/32026R1739), [DGAV](https://www.dgav.pt/alimentos/conteudo/generos-alimenticios/informar-o-consumidor-e-rotular/informacao-sobre-rotulagem/), [Microsoft pt-PT guide](https://download.microsoft.com/download/9/9/5/995a8ca6-383c-439d-9db0-cd457c9c2724/por-prt-StyleGuide.pdf), [Microsoft pt-BR guide](https://download.microsoft.com/download/8/e/3/8e349e32-9eb9-4b63-9909-7586b94a24dd/por-bra-StyleGuide.pdf). Each opened 2026-11-06, except that Anvisa's own RDC 727 PDF refused the fetch, so Annex III should be rechecked against the DOU. PL 1030's article text wasn't opened; its effect comes from press reports. ASAE's pages couldn't be opened.
## Traditional Chinese (zh-TW)

The address segment is `zh`: `/tw/zh/...`. Two letters keep every address, cookie and route rule as they are. The page itself says `lang="zh-TW"`, through `languageTag`, because a bare `zh` lets a browser draw mainland glyphs. This text is written for Taiwan, never converted from Simplified.

| English | Traditional Chinese | Why |
|---|---|---|
| vegan | 純素 | The word in TFDA's rule and on packages; see below |
| swap, alternative | 替代品 | Same word everywhere |
| plant-based | 植物性 | TFDA's word. 植物基 is an undefined trade term |
| Closest to the original | 最接近原版 | A ranking name, never reworded |
| Tastiest | 最美味 | A ranking name, never reworded |
| food | 食品 | |
| aisle, category | 分類 | |
| rating | 評分 | |
| score | 分數 | |
| member | 會員 | |
| review (staff) | 審核 | |
| submission | 送審資料 | Not 投稿, which is a Japanese habit here |
| flavor | 口味 | The product's flavor, never the taste score |
| taste score | 美味度 | |
| Top | 排名最高 | Never 熱門, which is Trending |
| report | 回報 | 檢舉 only for comments and abuse |
| classification | 純素狀態 | Never 分類, which is an aisle |
| recipe, formula | 配方 | |
| retailer, store | 通路、門市 | |
| allergen | 過敏原 | |
| Contains | 含有 | `本產品含有○○` is the required label form |
| May contain | 可能含有 | Not the label's own wording; see below |
| ingredients | 成分 | |
| email | 電子郵件 | |
| product | 商品 | |
| product line | 系列 | |
| account | 帳號 | Not 帳戶, which is a bank's word |
| sign in | 登入 | |
| search | 搜尋 | Not 搜索 |
| save | 儲存 | Not 保存 |
| operator | 營運團隊 | |
| moderator | 審核員 | |
| Free from | 過敏原篩選, with 排除 on the value | Never `不含…`, which reads as our guarantee |
| declaration | 標示 | Never 申報, which is filing with an authority |
| Labeled vegan | 標示為全素或純素 | One legal category |

- Address the reader as 您. Use plain noun labels for buttons and headings. No exclamation marks.
- Punctuation is full-width: `，。：；？（）「」、`, with `…` for an ellipsis and ` · ` between facts, never the Japanese `・`. No spaces between Chinese and numbers or placeholders.
- Use Taiwan's words: 起司, 優格, 冰淇淋, 馬鈴薯, 鳳梨, 義大利麵, 培根, 影片, 連結, 資料, 使用者, 網路, 檔案.
- Allergen names are TFDA's 11 categories, without `及其製品`: 甲殼類, 芒果, 花生, 奶類, 蛋, 堅果類, 芝麻, 含麩質之穀物, 大豆, 魚類, 亞硫酸鹽類. Goat's milk is part of the milk item. We write 奶類, TFDA's allowed category name, because 牛奶、羊奶 would read as two list items. Tree nuts include 栗子 and 椰子 by TFDA's Q&A.
- Taiwan's 全素 and 純素 are one legal category: `不含植物五辛（蔥、蒜、韭、蕎及興渠）之純植物性食物`. That is stricter than vegan. A vegan product with garlic or onion can't use the word, and must say 植物五辛素. That category also allows milk or egg if named in the ingredients, so 植物五辛素 alone doesn't mean vegan. 蛋素, 奶素 and 奶蛋素 aren't vegan. 全植物 and 純植物 are marketing words with no rule behind them.
- Our own 純素 status means no animal ingredients, the policy's meaning, so it can include 五辛. `safety.taiwanMark` says so in Add a product.
- **Honey is unresolved.** The Chinese rule never mentions it. `純植物性` should exclude it, but the 素食標示Q&A could not be found, and TFDA's unofficial English version lists honey under ovo-lacto. Our text never says what 全素 or 純素 allows on honey.
- "May contain" is voluntary in Taiwan. The recommended form is `本產品生產製程廠房，其設備或生產管線有處理○○`, and 可能含有 is a customary shorthand for it. Our text describes what a label warned about, and must never read as our own judgement.
- Don't call a plant-based food 肉 or 奶 as if it were one in our own copy. Food names in the taxonomy name the food being replaced, so 牛奶 stays 牛奶.

Sources, opened 2026-11-06: [TFDA, 食品過敏原標示規定](https://www.fda.gov.tw/TC/newsContent.aspx?cid=3&id=24294), in force since 2020-07-01 with no later amendment found; [its Q&A](https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f636916314364767147); [建議標示事項](https://www.fda.gov.tw/tc/includes/GetFile.ashx?id=f636916311713636044); [TFDA, 包裝食品宣稱為素食之標示規定](https://www.fda.gov.tw/tc/newsContent.aspx?id=10217).

## Korean (ko-KR)

| English | Korean | Why |
|---|---|---|
| vegan | 비건 | The word in MFDS's guideline and on packages |
| swap, alternative | 대체품 | Same word everywhere. 대체식품 is MFDS's regulated label term, so we don't use it for our own lists |
| plant-based | 식물성 | Says where an ingredient comes from. It doesn't mean 비건 |
| Closest to the original | 원제품에 가장 가까운 순 | A ranking name, never reworded |
| Tastiest | 가장 맛있는 순 | A ranking name, never reworded |
| food | 식품 | |
| aisle, category | 카테고리 | |
| rating | 평가 | |
| score | 점수 | |
| member | 회원 | |
| review (staff) | 검토 | |
| submission | 제출 항목 | |
| flavor | 맛 | |
| recipe, formula | 레시피 | |
| retailer, store | 판매처, 매장 | |
| Commonly found at | 주로 판매되는 곳 | Never live stock |
| package | 포장 | Not 패키지 |
| label says | 표시 | MFDS's word. Not 표기 |
| accept, reject | 승인, 거절 | Staff decisions |
| allergen | 알레르기 유발물질 | MFDS's term |
| Contains | 함유 | `○○ 함유`, as on labels |
| May contain | 혼입 가능성 있음 | MFDS's own form |
| ingredients | 원재료 | |
| email | 이메일 | |
| product | 제품 | |
| product line | 제품 라인 | |
| sign in | 로그인 | |
| operator | 운영팀 | |
| moderator | 모더레이터 | |
| Free from | 알레르기 유발물질 제외 | Never `무함유`, which reads as our guarantee |

- Use 합쇼체 (`-습니다`, `-십시오`) in every sentence, never 해요체, and plain noun labels for buttons and headings. No exclamation marks.
- Allergen names are MFDS's list: 알류, 우유, 메밀, 땅콩, 대두, 밀, 고등어, 게, 새우, 돼지고기, 복숭아, 토마토, 아황산류(이산화황), 호두, 닭고기, 쇠고기, 오징어, 조개류(굴, 전복, 홍합 포함), 잣. MFDS counts the three shellfish separately, so it says 22 foods from these 19 lines.
- MFDS proposed adding 참깨, 들깨, 아몬드 and 캐슈너트 on 2026-08-07 (공고 제2026-386호, comments to 2026-09-17). No final rule was found, so they aren't on our list. Add them when the rule is published.
- `{food}`, `{country}` and other names are filled at runtime, and Korean particles depend on the last letter. Don't attach a particle to a placeholder. Rewrite the sentence, or quote the name and follow it with a noun: `“{food}” 카테고리`. Numbers take a counter, as in `3개`, `5명`.
- A plural entry keeps `one` and `other` with the same text.
- Food names say 소고기 and 체더 치즈, while the allergen stays MFDS's 쇠고기. Search hints must use the food names, because search matches letters.
- Handles are Latin only, so say 영문자, not 문자.
- Don't write 비건 고기 or 식물성 우유 in our own copy: MFDS's guideline keeps animal-food words out of product names, even with 식물성 in front. Food names in the taxonomy name the food being replaced, so 우유 stays 우유.
- **Honey is unconfirmed.** MFDS's definition, `동물성 원재료를 첨가 또는 사용하지 않고`, implies 비건 excludes it, but the guideline PDF itself wasn't opened. Our text doesn't say.

Sources, opened 2026-11-06: [식품표시광고법 시행규칙 별표 2](https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=42533884&bylClsCd=110201), an undated PDF, so its currency needs a check on law.go.kr; [MFDS, 공고 제2026-386호](https://www.mfds.go.kr/brd/m_209/view.do?seq=44285); [MFDS, 비건 표시·광고 가이드라인](https://impfood.mfds.go.kr/CFBDD06F02/getCntntsDetail?cntntsSn=510653), notice page only; [MFDS, 대체식품 표시 가이드라인](https://www.mfds.go.kr/brd/m_1060/view.do?seq=15387), notice page only, with its detail from [foodnews](https://www.foodnews.co.kr/news/articleView.html?idxno=105581).
