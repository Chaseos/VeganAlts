# Translation glossary

Every language shares these rules. Each language has its own term list below, decided before translation. The process is the `product-multilingual` skill: a separate agent scores the work, and high-stakes strings are translated back and compared.

## High-stakes strings

Keys starting `safety.` or `allergen.`, and any key naming a vegan status, an allergen or "not checked". A person must review these for each market before a language leaves preview. Reusing text from another market of the same language doesn't count as review.

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
