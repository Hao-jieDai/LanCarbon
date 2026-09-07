import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { addNoteToBook, createBook } from "../src/shared/books";
import { buildMystConfig, generateBookProject, renderPage, splitFrontmatter } from "../src/shared/jupyter-book";
import { createNote } from "../src/shared/notes";

function fixture() {
  const created = createBook("Energy Book");
  const note = createNote({ title: "GCAM 简介", content: "---\ndescription: 旧说明\nid: internal\ncustom: keep\n---\n\n# 正文\n" });
  const book = addNoteToBook(created.book, note, { parentPageId: created.book.homePageId });
  const page = Object.values(book.pages).find(item => item.noteId === note.id)!;
  page.exportPath = "gcam/introduction.md"; page.showInToc = false;
  page.metadata = { shortTitle: "GCAM", description: "新说明", authors: [{ name: "Author" }], label: "gcam-intro" };
  book.settings = { ...book.settings, subtitle: "Subtitle", description: "Research", authors: [{ name: "Book Author" }], keywords: ["energy"], siteTitle: "Energy Site", logo: "images/logo.png", favicon: "images/favicon.ico" };
  return { workspace: { version: 2 as const, notes: [created.homeNote, note], books: [book] }, book, page, note };
}

describe("Jupyter Book 项目生成", () => {
  it("生成符合 v2 结构的 myst.yml 和嵌套隐藏 TOC", () => {
    const { book } = fixture(); const myst = buildMystConfig(book); const config = YAML.parse(myst);
    expect(config).toMatchObject({ version: 1, project: { title: "Energy Book", subtitle: "Subtitle", toc: [{ file: "index.md", children: [{ file: "gcam/introduction.md", hidden: true }] }] }, site: { template: "book-theme", title: "Energy Site", options: { logo: "images/logo.png", favicon: "images/favicon.ico" } } });
    expect(config).not.toHaveProperty("_toc");
    expect(myst).toMatchInlineSnapshot(`
      "version: 1
      project:
        title: Energy Book
        subtitle: Subtitle
        description: Research
        authors:
          - name: Book Author
        keywords:
          - energy
        toc:
          - file: index.md
            children:
              - file: gcam/introduction.md
                hidden: true
      site:
        template: book-theme
        title: Energy Site
        options:
          logo: images/logo.png
          favicon: images/favicon.ico
          style: ./lancarbon-theme.css
      "
    `);
  });

  it("合并已有 frontmatter 且不输出内部字段", () => {
    const { note, page } = fixture(); const rendered = renderPage(note, page); const parsed = splitFrontmatter(rendered);
    expect(parsed.frontmatter).toMatchObject({ title: "GCAM 简介", short_title: "GCAM", description: "新说明", authors: [{ name: "Author" }], label: "gcam-intro", custom: "keep" });
    expect(parsed.frontmatter).not.toHaveProperty("id"); expect(parsed.body).toContain("# 正文"); expect(note.content).toContain("id: internal");
  });

  it("拒绝未闭合 frontmatter 和未实现的 notebook 页面", () => {
    expect(() => splitFrontmatter("---\ntitle: broken\n正文")).toThrow("unclosed");
    const { note, page } = fixture(); expect(() => renderPage(note, { ...page, sourceType: "notebook" })).toThrow("not supported");
  });

  it("生成完整项目文件集合", () => {
    const { workspace } = fixture(); const project = generateBookProject(workspace, workspace.books[0].id);
    expect([...project.files.keys()]).toEqual(expect.arrayContaining(["myst.yml", "README.md", "index.md", "gcam/introduction.md", "lancarbon-theme.css"]));
    const config = YAML.parse(project.files.get("myst.yml")!);
    expect(project.files.has(config.site.options.style.replace(/^\.\//, ""))).toBe(true);
    expect(project.files.get("lancarbon-theme.css")).toContain("html:root.dark");
    expect(project.files.get("lancarbon-theme.css")).toContain('img[style*="margin-left: auto"][style*="margin-right: auto"] + figcaption { text-align: center; }');
    expect(project.files.get("lancarbon-theme.css")).toContain('img[style*="margin-left:auto"][style*="margin-right:0"] + figcaption');
    expect(project.files.get("lancarbon-theme.css")).not.toMatch(/@import|https?:\/\//);
    expect(project.files.get("README.md")).toContain("jupyter book start");
  });

  it("空的提示性标题和页面路径使用稳定回退值导出", () => {
    const { book: initial, homeNote } = createBook("Temporary");
    const note = createNote({ id: "fallback-note", title: "Fallback page" });
    const bookWithPage = addNoteToBook(initial, note);
    const page = Object.values(bookWithPage.pages).find(item => item.noteId === note.id)!;
    const book = { ...bookWithPage, settings: { ...bookWithPage.settings, title: "" }, pages: { ...bookWithPage.pages, [page.id]: { ...page, exportPath: "" } } };
    const project = generateBookProject({ version: 2, notes: [homeNote, note], books: [book] }, book.id);
    expect(project.files.get("README.md")).toContain("# Untitled Book");
    const config = YAML.parse(project.files.get("myst.yml")!);
    expect(project.files.has(config.site.options.favicon.replace(/^\.\//, ""))).toBe(true);
    expect(project.files.has(`page-${page.id.slice(0, 8)}.md`)).toBe(true);
  });
});
