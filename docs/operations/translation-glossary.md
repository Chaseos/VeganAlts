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
