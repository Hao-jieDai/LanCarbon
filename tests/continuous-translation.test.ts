import { describe, it, expect } from "vitest";
import { appendTranslationText } from "../src/shared/translation";
describe("continuous translation source", () => {
  it("joins passages in selection order with normalized page whitespace", () => {
    expect(appendTranslationText("The policy\nreduced", "\n emissions. ")).toBe("The policy reduced emissions.");
    expect(appendTranslationText("Evidence from 2007.", "Another study in 2012.")).toBe("Evidence from 2007. Another study in 2012.");
    expect(appendTranslationText("", "First passage.")).toBe("First passage.");
  });
  it("retains intentional repeats and hard hyphens, and removes soft hyphens", () => {
    expect(appendTranslationText("Very", "very important.")).toBe("Very very important.");
    expect(appendTranslationText("A cross-sectional", "sample.")).toBe("A cross-sectional sample.");
    expect(appendTranslationText("invest\u00ad\nment", "costs")).toBe("investment costs");
  });
  it("applies the existing length and word limits to the whole passage", () => {
    expect(() => appendTranslationText("a".repeat(1500), "b".repeat(101))).toThrow("1,600");
    expect(() => appendTranslationText("word ".repeat(240), "more ".repeat(11))).toThrow("250 words");
  });
});
