import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { THEME_COLORS } from "../../app/lib/theme";

const tokensCss = readFileSync("app/styles/tokens.css", "utf8");

function block(selector: string) {
  const start = tokensCss.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const end = tokensCss.indexOf("}", start);
  const values: Record<string, string> = {};
  for (const match of tokensCss
    .slice(start, end)
    .matchAll(/(--va-[a-z0-9-]+):\s*([^;]+);/g))
    values[match[1]!] = match[2]!.trim().toLowerCase();
  return values;
}

const light = block(":root");
const darkMedia = block(':root:not([data-theme="light"])');
const darkChoice = block(':root[data-theme="dark"]');
const themes = { light, dark: darkChoice };

function luminance(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

// Every foreground/background pairing the components use. Text needs 4.5:1;
// borders that alone identify a control, focus rings and the emphasis border
// need 3:1 against what they sit on.
const TEXT: [string, string][] = [
  ...["--va-ground", "--va-surface", "--va-surface-2", "--va-field"].flatMap(
    (bg) =>
      [
        "--va-ink",
        "--va-ink-2",
        "--va-muted",
        "--va-good",
        "--va-flag-text",
      ].map((fg) => [fg, bg] as [string, string]),
  ),
  ["--va-on-kale", "--va-kale"],
  ["--va-on-kale", "--va-kale-2"],
  ["--va-on-kale-muted", "--va-kale"],
  ["--va-on-kale-muted", "--va-kale-2"],
  ["--va-tag", "--va-kale"],
  ["--va-tag", "--va-kale-2"],
  ["--va-on-tag", "--va-tag"],
  ["--va-on-flag", "--va-flag"],
  ["--va-on-btn", "--va-btn"],
  ["--va-good", "--va-good-bg"],
  ["--va-warn", "--va-warn-bg"],
  ["--va-ink", "--va-warn-bg"],
];

const NON_TEXT: [string, string][] = [
  ...["--va-ground", "--va-surface", "--va-surface-2", "--va-field"].flatMap(
    (bg) =>
      ["--va-field-line", "--va-focus", "--va-btn", "--va-emphasis"].map(
        (fg) => [fg, bg] as [string, string],
      ),
  ),
  ["--va-focus-on-kale", "--va-kale"],
  ["--va-focus-on-kale", "--va-kale-2"],
  ["--va-tag", "--va-kale"],
  ["--va-flag", "--va-surface"],
];

describe("design tokens", () => {
  it("defines the same tokens in every theme block", () => {
    expect(Object.keys(darkMedia).sort()).toEqual(Object.keys(light).sort());
    expect(darkMedia).toEqual(darkChoice);
  });

  for (const [name, values] of Object.entries(themes)) {
    it(`meets WCAG 2.2 AA text contrast in the ${name} theme`, () => {
      const failures = TEXT.filter(
        ([fg, bg]) => contrast(values[fg]!, values[bg]!) < 4.5,
      ).map(
        ([fg, bg]) =>
          `${fg} on ${bg}: ${contrast(values[fg]!, values[bg]!).toFixed(2)}`,
      );
      expect(failures).toEqual([]);
    });

    it(`meets 3:1 for controls, focus and emphasis in the ${name} theme`, () => {
      const failures = NON_TEXT.filter(
        ([fg, bg]) => contrast(values[fg]!, values[bg]!) < 3,
      ).map(
        ([fg, bg]) =>
          `${fg} on ${bg}: ${contrast(values[fg]!, values[bg]!).toFixed(2)}`,
      );
      expect(failures).toEqual([]);
    });
  }

  it("keeps the browser theme color equal to the kale header", () => {
    expect(THEME_COLORS.light).toBe(light["--va-kale"]);
    expect(THEME_COLORS.dark).toBe(darkChoice["--va-kale"]);
  });
});

function files(directory: string, extension: RegExp): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? files(path, extension)
      : extension.test(entry)
        ? [path]
        : [];
  });
}

describe("styling boundaries", () => {
  it("uses no literal colors outside the token file", () => {
    const offenders = files("app/styles", /\.css$/)
      .filter((path) => !path.endsWith("tokens.css"))
      .flatMap((path) => {
        const css = readFileSync(path, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/@media \(forced-colors: active\)[\s\S]*?\n}\n/g, "");
        return [
          ...css.matchAll(
            /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|lab|lch)\(|:\s*(?:white|black|red|green|blue|gray|grey)\b/g,
          ),
        ].map((match) => `${path}: ${match[0]}`);
      });
    expect(offenders).toEqual([]);
  });

  it("never renders inline styles, which the content security policy blocks", () => {
    const offenders = files("app", /\.tsx$/).filter((path) =>
      /\sstyle=|<style[\s>]/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
