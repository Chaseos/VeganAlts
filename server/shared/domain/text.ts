// Comparing and addressing names in any script. Spoken languages differ in
// what they treat as one letter, so each step here is limited to Latin text or
// to one script: decomposing kana or Hangul would break their letters apart.

const LATIN_MARKS = /(\p{Script=Latin})\p{M}+/gu;
const LIGATURES: Record<string, string> = { œ: "oe", æ: "ae", ß: "ss" };
const KATAKANA = /[ァ-ヶ]/g;

/** Half-width and case variants folded, and accents off Latin letters only. */
export function foldLatinMarks(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(LATIN_MARKS, "$1")
    .normalize("NFC");
}

/**
 * The form two names share when a shopper would call them the same: case,
 * Latin accents and ligatures, half-width forms and katakana against hiragana.
 */
export function foldForMatch(value: string) {
  return foldLatinMarks(value)
    .replace(/[œæß]/g, (letter) => LIGATURES[letter]!)
    .replace(KATAKANA, (letter) =>
      String.fromCharCode(letter.charCodeAt(0) - 0x60),
    );
}

/** The letters, marks and digits of a name, for duplicate checks. */
export function matchKey(value: string) {
  return foldForMatch(value).replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

/**
 * An ASCII address segment. Other scripts leave nothing, so callers choose a
 * fallback: addresses stay ASCII in every language.
 */
export function latinSlug(value: string) {
  return foldForMatch(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
