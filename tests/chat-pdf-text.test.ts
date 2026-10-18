import { expect, it } from "vitest";
import { chatPdfMarkdown } from "../src/shared/chatPdf";
it("escapes currency prose without rewriting math, code or existing currency escapes", () => {
  expect(chatPdfMarkdown("US$1.4 trillion and US$300 billion")).toBe("US\\$1.4 trillion and US\\$300 billion");
  expect(chatPdfMarkdown("$1.4 trillion and $300 billion")).toBe("\\$1.4 trillion and \\$300 billion");
  expect(chatPdfMarkdown("$E=mc^2$ and $1.4 trillion$ and US\\$1.4 trillion")).toBe("$E=mc^2$ and $1.4 trillion$ and US\\$1.4 trillion");
  const code = '`US$1.4 trillion`\n```txt\nUS$300 billion\n```'; expect(chatPdfMarkdown(code)).toBe(code);
});
