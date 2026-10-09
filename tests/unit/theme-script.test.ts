import { describe, expect, it } from "vitest";
import { parseTheme, THEME_SCRIPT } from "../../app/lib/theme";
import { parseCountryList } from "../../app/lib/device-preferences";

function run(stored: string | null, throws = false) {
  const attributes: Record<string, string> = {};
  const localStorage = {
    getItem(key: string) {
      if (throws) throw new Error("blocked");
      return key === "veganalts.theme.v1" ? stored : null;
    },
  };
  const document = {
    documentElement: {
      setAttribute(name: string, value: string) {
        attributes[name] = value;
      },
    },
  };
  new Function("localStorage", "document", THEME_SCRIPT)(
    localStorage,
    document,
  );
  return attributes["data-theme"];
}

describe("pre-paint theme script", () => {
  it("applies an explicit choice before first paint", () => {
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
  });

  it("leaves System (no choice or anything else) to the media query", () => {
    expect(run(null)).toBeUndefined();
    expect(run("purple")).toBeUndefined();
  });

  it("survives blocked storage", () => {
    expect(run("dark", true)).toBeUndefined();
  });

  it("parses stored choices", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("system")).toBe("system");
  });
});

describe("device preference lists", () => {
  it("reads one country's list and ignores malformed storage", () => {
    const raw = JSON.stringify({ us: ["target", 3, "kroger"], ca: [] });
    expect(parseCountryList(raw, "us")).toEqual(["target", "kroger"]);
    expect(parseCountryList(raw, "gb")).toEqual([]);
    expect(parseCountryList("{not json", "us")).toEqual([]);
    expect(parseCountryList(null, "us")).toEqual([]);
  });
});
