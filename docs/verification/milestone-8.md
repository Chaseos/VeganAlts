# Milestone 8 verification

## Food review calibration (2026-11-05)

Checkpoint 0 of the [milestone 8 plan](../MILESTONE_8_PLAN.md). Run with `npm run moderation:calibrate:foods`: 129 labelled food names and 6 synthetic Japanese package photos. All decisions used Haiku 5.5's English text as input. Raw output stays in the ignored `test-results/milestone-8`.

**Not yet proven.** The labels were written by Claude and have had no Japanese speaker's check. The gloss gate has had only a sample read, not the full human check. The photos are clean renders for a fictional brand.

**Decisions at the plan's thresholds** (accept 0.85, alias 0.90, changes 0.90). The automatic gate is 70% or more.

| Decider | Language | Cases | Wrong accept | Wrong alias | Abuse accepted | Automatic | Gates |
| --- | --- | --: | --: | --: | --: | --: | --- |
| Clef | Japanese | 64 | 0% | 0% | 0 | 37.5% | Fail, automatic |
| Clef | French | 32 | 0% | 0% | 0 | 56.3% | Fail, automatic |
| Clef-flash | Japanese | 64 | 0% | 0% | 0 | 45.3% | Fail, automatic |
| Clef-flash | French | 32 | 0% | 0% | 0 | 34.4% | Fail, automatic |
| Haiku 5.5 | Japanese | 64 | 15.6% | 0% | 0 | 95.3% | Fail, wrong accept |
| Haiku 5.5 | French | 32 | 3.1% | 0% | 0 | 93.8% | Fail, wrong accept |

Clef made no harmful decision at any language, but its scores run lower than these thresholds. Haiku accepted foods the taxonomy already has as new, such as 牛乳 for Milk, even though it named Milk as the closest candidate.

**Clef with relaxed thresholds,** re-scored from saved answers at no cost (accept 0.60, alias 0.60, changes 0.70):

| Decider | Language | Wrong accept | Wrong alias | Abuse accepted | Automatic | Gates |
| --- | --- | --: | --: | --: | --: | --- |
| Clef | Japanese | 0% | 0% | 0 | 82.8% | Pass |
| Clef | French | 0% | 0% | 0 | 87.5% | Pass |
| Clef-flash | Japanese | 0% | 0% | 1 | 79.7% | Fail, abuse |
| Clef-flash | French | 0% | 0% | 0 | 81.3% | Pass |

Thresholds of 0.70, 0.70 and 0.80 let one abuse case through in Japanese for both Clef models, so this margin is thin.

**Held-out run.** 52 new names, 35 Japanese and 17 French, labelled and frozen with the thresholds fixed before any model saw them. It used Haiku's text and full Clef, and cost $0.04.

| Language | Cases | Wrong accept | Wrong alias | Abuse accepted | Automatic | Gates |
| --- | --: | --: | --: | --: | --: | --- |
| Japanese | 35 | 2.9% (1 case) | 0% | 0 | 88.6% | Fail, wrong accept |
| French | 17 | 0% | 0% | 0 | 88.2% | Pass |

The failure was ラザニア, accepted as new although Lasagna exists. Clef never saw Lasagna: the shortlist ranked gloss words such as "cheese" and "pasta" above the English name, and filled all 20 places. With these sample sizes one case decides the gate, so this is weak evidence either way.

Both faults found here are fixed in the script and covered by unit tests, but not re-measured: the shortlist now ranks name matches first, and a suggestion with no candidates no longer asks a one-option question. That question caused every Clef failure so far, four in all. Measuring the fixes needs a fresh set, because this one has now been seen.

**Twelve-language run.** 528 names, 44 per language and one country each, frozen with the thresholds fixed before any model saw them. 523 were new: Milch, Eier, Butter, 우유 and 버터 had appeared in the calibration set used to choose those thresholds. It used Haiku's text and full Clef, with the shortlist and question fixes in place, and cost $0.38. No call failed, and the right food reached Clef in 233 of 240 cases.

| Language | Country | Wrong accept | Wrong alias | Abuse accepted | Automatic | Gates |
| --- | --- | --: | --: | --: | --: | --- |
| Portuguese | BR | 0 | 0 | 0 | 81.8% | Pass |
| Italian | IT | 0 | 0 | 0 | 81.8% | Pass |
| Korean | KR | 0 | 0 | 0 | 97.7% | Pass |
| Thai | TH | 0 | 0 | 0 | 97.7% | Pass |
| Spanish | MX | 1 | 0 | 0 | 86.4% | Fail |
| German | DE | 1 | 0 | 0 | 95.5% | Fail |
| Hindi | IN | 1 | 0 | 0 | 93.2% | Fail |
| Polish | PL | 1 | 1 | 0 | 84.1% | Fail |
| Dutch | NL | 2 | 0 | 0 | 93.2% | Fail |
| Simplified Chinese | CN | 2 | 1 | 0 | 88.6% | Fail |
| Traditional Chinese | TW | 2 | 0 | 0 | 81.8% | Fail |
| Arabic | AE | 0 | 0 | 1 | 95.5% | Fail |
| All | | 10 (1.9%) | 2 (0.4%) | 1 | 89.8% | |

The gates allow no error at this size: one mistake in 44 is 2.3%, so one case fails a language. Read the table for patterns, not as a verdict on each language.

- **The one abuse case:** برجر نباتي ("plant burger") became an alias of Beef Burgers. Its claim word needs a deterministic list by language, ahead of any model.
- **Missed candidates:** 肉丸 and मीटबॉल never reached Clef, because the shortlist didn't match the singular Meatball with Meatballs. The shortlist now folds plurals, but this table predates that fix.
- **Local words for known foods:** most wrong accepts were duplicates, such as Tocino, Speck and Boczek for Bacon. These do little harm: a provisional food can be merged.
- **Text errors:** Haiku romanized 千層麵 as Qiancengmian and missed Lasagna, so Clef had no matching name to compare.
- **Doubtful labels:** Kiełbasa as Dinner Sausages may be right, and Boerenkool may be a dish as well as kale. A native speaker should settle these.

**Known issues.**

- キムチ went to Needs changes at the relaxed thresholds, because Clef treats kimchi as plant-based while the taxonomy keeps it for its fish sauce. Alias is now checked first.
- Claim scores can sit below the threshold: 糖質オフハム scored 0.65 and 乳不使用チーズ 0.57. Both went to the queue, which is safe.
- A translated injection attempt becomes a plain English name. It must not be published or shown before the decision.

**Text models.**

| Model | Usable output | Note |
| --- | --: | --- |
| Haiku 5.5 | 129 of 129 | Good on the sample read |
| Sonnet 5.5 | 128 of 129 | Slightly more exact, with more readings; the one failure is the URL case, correctly flagged |
| Gemma 4 | 96 of 129 | Failed the rest, and much slower |
| GLM 4.7 Flash | 0 of 5 | Spent its 1,200 tokens reasoning; dropped after the smoke test |
| Kimi K2.7 Code | 5 of 5 | Dropped after the smoke test on cost and speed |

**Photos.** Sonnet 5.5 got 6 of 6. Clef got 5 of 6, answering UNCLEAR on a matching front photo, which would hold that product for review.

**Cost.** All runs together cost about $1.14 by the script's own token count: $0.60 for the full run, $0.38 for the twelve-language run, $0.04 for the held-out run and about $0.12 for test runs. Haiku text with full Clef comes to about $0.0008 per review.

## Canadian French (2026-11-06)

About 1,280 interface strings, 152 food and aisle names, 15 allergen names and 10 country names. Translated in four batches with the `product-multilingual` skill, then checked twice by separate agents that didn't write the text.

| Check | Result |
|---|---|
| First independent review, 1,222 strings | 1 critical, 47 high, 32 medium and 27 low findings; reported score 3.75/30 |
| Second review after fixes, 197 strings | 0 critical, 0 high, 5 medium, 17 low; applied, except `code.discontinued` and one fix that wasn't a translation |
| Back-translations of high-stakes strings | 143 recorded |
| `check_catalog.py` | Passes, with identical strings such as "." and "Menu" allowed |

The first review's critical finding was `filters.freeLabelAny`: the screen-reader label read as if the list was allergen-free when no filter was on. The English had the same ambiguity, so both changed.

The first score is low because the rubric deducts per root cause. No score has been calculated since the fixes, and there has been no native review, so French stays preview-only. Regional food names, `soya`, and the OQLF claims made by the reviewers still need a person.

Not reviewed by a second agent: the country names in `server/catalog/domain/local-names.ts`, and the last wording of `filters.freeLabelAny` and `language.label`.

The French chunk is 84 KB, or 24 KB compressed, and English pages don't load it.

## Japanese (2026-11-06)

About 1,290 interface strings, 152 food and aisle names, Japan's 29 allergen items and 10 country names. Same process as French. English pages don't load the Japanese chunk, which is 89 KB, or 24 KB compressed.

| Check | Result |
|---|---|
| First independent review, 1,281 strings | 3 critical, 10 high, 102 medium and 50 low entries; reported score 0.75/30 |
| Second review after fixes, 239 strings | 0 critical, 0 high, 1 medium, 8 low; applied |
| Back-translations of high-stakes strings | 144 recorded blind |

The critical findings were "free from" reading as the site's own guarantee, and "may contain" reading as the site's own judgement. Japanese labels can't say an allergen may be present, so the wording now names the label's warning. Most medium findings came from four batches choosing different words for terms the glossary lacked, now added.

The score is low for the same reason as French, and hasn't been recalculated since the fixes. There has been no native review, so Japanese stays preview-only.

Found in code by this work: a label with only "may contain" showed "No major allergens on the label" in every language; search refused 卵 and other one- or two-character words; and Japan's animal allergens had to join the list that opens a classification review.

Japan's list is the Consumer Affairs Agency's 9 required and 20 recommended items, as of April 2026. It has no store list yet.
