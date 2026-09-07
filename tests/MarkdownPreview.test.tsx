import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownPreview, renderSafeMystHtml } from "../src/components/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders common Markdown through the official MyST pipeline", () => {
    render(<MarkdownPreview visible content={'# Heading\n\n- Item\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst n = 1;\n```'} />);
    const preview = screen.getByLabelText("Rendered preview");
    expect(preview.querySelector("h1")).toHaveTextContent("Heading");
    expect(preview.querySelector("li")).toHaveTextContent("Item");
    expect(preview.querySelector("table")).toBeInTheDocument();
    expect(preview.querySelector("pre code")).toHaveTextContent("const n = 1;");
  });

  it("sanitizes executable HTML and blocks preview navigation", () => {
    const rendered = renderSafeMystHtml('<script>alert(1)</script><a href="https://example.com" onclick="alert(2)">Link</a><img src="https://example.com/track.png">');
    const host = document.createElement("div"); host.innerHTML = rendered.html;
    expect(host.querySelector("script, img, [onclick]")).toBeNull();
    expect(host.textContent).toContain("<script>alert(1)</script>");
    render(<MarkdownPreview visible content="[Safe link](https://example.com)" />);
    expect(fireEvent.click(screen.getByRole("link", { name: "Safe link" }))).toBe(false);
  });

  it("shows an empty state without changing the source", () => {
    render(<MarkdownPreview visible content="" />);
    expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  });

  it("preserves toolbar column alignment in sanitized table HTML", () => {
    render(<MarkdownPreview visible content={"| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| a | b | c |"} />);
    const preview = screen.getByLabelText("Rendered preview");
    expect(Array.from(preview.querySelectorAll("tbody td"), cell => cell.getAttribute("align"))).toEqual(["left", "center", "right"]);
  });
});
