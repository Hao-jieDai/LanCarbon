import { describe, expect, it } from "vitest";
import { renderMystPreview, type PreviewDocument } from "../src/preview/mystPreview";

function render(content: string, documents?: PreviewDocument[]) {
  const result = renderMystPreview({ id: "a", title: "Current", path: "chapter/current.md", content }, documents);
  expect(result.error).toBeUndefined();
  const host = document.createElement("div"); host.innerHTML = result.html;
  return { ...result, host };
}

describe("Phase 2C MyST preview", () => {
  it("renders offline inline/block/role/directive math with labels and local equation numbers", () => {
    const result = render('$x^2$ and {math}`y^2`\n\n```{math}\n:label: eq-one\nE=mc^2\n```\n\n$$\\label{eq-two}z=3$$\n\n{eq}`eq-one` and [](#eq-two)');
    expect(result.warnings).toEqual([]);
    expect(result.host.querySelectorAll(".katex")).toHaveLength(4);
    expect(result.host.querySelectorAll("math")).toHaveLength(4);
    expect(result.host.querySelector("#lc-target-eq-one .equation-number")).toHaveTextContent("(1)");
    expect(result.host.querySelectorAll("#lc-target-eq-one")).toHaveLength(1);
    expect(result.host.querySelector('a[href="#lc-target-eq-one"]')).toHaveTextContent("(1)");
    expect(result.host.querySelector('a[href="#lc-target-eq-two"]')).toHaveTextContent("Equation 2");
  });
  it("renders official nested directives and inline roles", () => {
    const result = render('::::{warning}\nAttention **please**\n\n:::{note}\nInner note\n:::\n::::\n\n:::{dropdown} Details\nHidden body\n:::\n\n{abbr}`CO2 (Carbon dioxide)` H{sub}`2`O x{sup}`2` {kbd}`Ctrl+S`');
    expect(result.host.querySelector(".warning .note")).toHaveTextContent("Inner note");
    expect(result.host.querySelector("details summary")).toHaveTextContent("Details");
    expect(result.host.querySelector("details")).toHaveTextContent("Hidden body");
    expect(result.host.querySelector("abbr")).toHaveAttribute("title", "Carbon dioxide");
    expect(result.host.querySelector("sub")).toHaveTextContent("2");
    expect(result.host.querySelector("sup")).toHaveTextContent("2");
    expect(result.host.querySelector("kbd")).toBeTruthy();
  });
  it("preserves LanCarbon line alignment classes", () => {
    const result = render(":::{div}\n:class: lc-align-center\n\nCentered text\n:::");
    expect(result.warnings).toEqual([]);
    expect(result.host.querySelector(".lc-align-center")).toHaveTextContent("Centered text");
  });
  it("resolves local, same-Book labels and relative page paths, including hidden pages", () => {
    const documents = [{ id: "b", title: "Other page", path: "other.md", label: "other-page", content: '(carbon)=\n# Carbon Cycle\n\n```{math}\n:label: eq-carbon\nC=1\n```' }];
    const result = render('(local)=\n# Here\n\n{ref}`local` [](#carbon) [Go](../other.md#carbon) [](#other-page) {eq}`eq-carbon`', documents);
    expect(result.warnings).toEqual([]);
    expect(result.host.querySelector('a[data-preview-note="a"]')).toHaveTextContent("Here");
    expect(result.host.querySelectorAll('a[data-preview-note="b"]')).toHaveLength(4);
    expect(result.host.querySelector('a[data-preview-anchor="lc-target-carbon"]')).toHaveTextContent("Carbon Cycle");
  });
  it("reports missing and ambiguous labels without guessing a destination", () => {
    const result = render('[](#missing) [](#same)', [
      { id: "b", title: "B", content: "(same)=\n# B" }, { id: "c", title: "C", content: "(same)=\n# C" }
    ]);
    expect(result.warnings.join(" ")).toContain("Unresolved reference: missing");
    expect(result.warnings.join(" ")).toContain("Ambiguous reference: same");
    expect(result.host.querySelectorAll(".preview-unresolved")).toHaveLength(2);
    expect(result.host.querySelector("a")).toBeNull();
  });
  it("supports frontmatter macros and preserves original source and cached ASTs", () => {
    const content = "---\nlabel: page-label\nmath:\n  '\\R': '\\mathbb{R}'\n---\n$\\R$\n\n[](#page-label)";
    const first = render(content); const second = render(content);
    expect(first.html).toEqual(second.html);
    expect(first.host.querySelector(".katex")).toBeTruthy();
    expect(first.host.querySelector("a")).toHaveTextContent("Current");
    expect(first.host.textContent).not.toContain("math:");
  });
  it("keeps unsupported syntax and invalid math visible with notices", () => {
    const result = render('```{unknown-widget}\nKeep this text\n```\n\n$\\notACommand{x}$\n\n{unknown-role}`Keep inline text`\n\n```{include} secret.txt\n```');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.host.textContent).toContain("Keep this text");
    expect(result.host.textContent).toContain("Keep inline text");
    expect(result.host.querySelector(".math-error")).toHaveTextContent("notACommand");
    expect(result.host.textContent).toContain("include");
  });
  it("blocks executable HTML, remote media and dangerous KaTeX macros", () => {
    const result = render('<script>alert(1)</script>\n\n<img src="https://example.com/track">\n\n$\\href{javascript:alert(1)}{Click}$\n\n$\\includegraphics{https://example.com/track}$\n\n[bad](file:///C:/Windows)');
    expect(result.host.querySelector("script,iframe,img,object,[onclick]")).toBeNull();
    expect(result.host.querySelector('a[href^="javascript:"],a[href^="file:"]')).toBeNull();
    expect(result.host.textContent).toContain("<script>");
  });
});
