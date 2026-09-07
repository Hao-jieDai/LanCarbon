import YAML from "yaml";
import { collectPageIds, effectiveExportPath, validateWorkspace } from "./books";
import type { Book, BookPage, Note, WorkspaceFile } from "./types";
import { WEBSITE_THEME_CSS, WEBSITE_THEME_PATH, WEBSITE_FAVICON_PATH, WEBSITE_FAVICON_SVG } from "./websiteTheme";

export interface GeneratedBookProject {
  files: Map<string, string>;
}

const INTERNAL_FRONTMATTER = new Set([
  "id", "noteId", "note_id", "createdAt", "created_at", "updatedAt", "updated_at",
  "pinned", "tags", "showInToc", "show_in_toc", "exportPath", "export_path", "sourceType", "source_type"
]);

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "" && (!Array.isArray(item) || item.length > 0))) as T;
}

export function splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!/^---\r?\n/.test(normalized)) return { frontmatter: {}, body: content };
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(normalized);
  if (!match) throw new Error("Page contains unclosed YAML frontmatter");
  const parsed = YAML.parse(match[1]);
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("Page frontmatter must be a YAML object");
  return { frontmatter: (parsed ?? {}) as Record<string, unknown>, body: normalized.slice(match[0].length) };
}

export function renderPage(note: Note, page: BookPage): string {
  if (page.sourceType !== "markdown") throw new Error(`Exporting ${page.sourceType} pages is not supported in this phase`);
  const { frontmatter, body } = splitFrontmatter(note.content);
  const safeExisting = Object.fromEntries(Object.entries(frontmatter).filter(([key]) => !INTERNAL_FRONTMATTER.has(key)));
  const merged = compact({
    ...safeExisting,
    title: note.title.trim() || "Untitled Page",
    short_title: page.metadata.shortTitle?.trim(),
    description: page.metadata.description?.trim(),
    authors: page.metadata.authors,
    date: page.metadata.date?.trim(),
    keywords: page.metadata.keywords,
    label: page.metadata.label?.trim()
  });
  const yaml = YAML.stringify(merged, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/^\r?\n/, "")}`;
}

export function buildToc(book: Book): Array<Record<string, unknown>> {
  const visit = (pageId: string): Record<string, unknown> => {
    const page = book.pages[pageId];
    if (!page) throw new Error(`The TOC references a missing page: ${pageId}`);
    return compact({
      file: effectiveExportPath(book, page),
      hidden: page.showInToc ? undefined : true,
      children: page.children.length ? page.children.map(visit) : undefined
    });
  };
  return book.rootPageIds.map(visit);
}

export function buildMystConfig(book: Book): string {
  const options = compact({ logo: book.settings.logo?.trim(), favicon: book.settings.favicon?.trim() || `./${WEBSITE_FAVICON_PATH}`, style: `./${WEBSITE_THEME_PATH}` });
  const config = {
    version: 1,
    project: compact({
      title: book.settings.title.trim() || "Untitled Book",
      subtitle: book.settings.subtitle?.trim(),
      description: book.settings.description?.trim(),
      authors: book.settings.authors,
      github: book.settings.github?.trim(),
      license: book.settings.license?.trim(),
      keywords: book.settings.keywords,
      bibliography: book.settings.bibliography?.map(source => `./assets/${source.assetId}`),
      toc: buildToc(book)
    }),
    site: compact({
      template: "book-theme",
      title: book.settings.siteTitle?.trim() || book.settings.title.trim() || "Untitled Book",
      options: Object.keys(options).length ? options : undefined
    })
  };
  return YAML.stringify(config, { lineWidth: 0 });
}

export function generateBookProject(workspace: WorkspaceFile, bookId: string): GeneratedBookProject {
  const workspaceErrors = validateWorkspace(workspace);
  if (workspaceErrors.length) throw new Error(workspaceErrors.join("\n"));
  const book = workspace.books.find(item => item.id === bookId);
  if (!book) throw new Error("The Book to export was not found");
  const title = book.settings.title.trim() || "Untitled Book";
  const files = new Map<string, string>();
  files.set("myst.yml", buildMystConfig(book));
  files.set(WEBSITE_THEME_PATH, WEBSITE_THEME_CSS);
  if (!book.settings.favicon?.trim()) files.set(WEBSITE_FAVICON_PATH, WEBSITE_FAVICON_SVG);
  files.set("README.md", `# ${title}\n\nExported by LanCarbon for Jupyter Book 2 / MyST Markdown.\n\n## Preview / 预览\n\n\`\`\`bash\njupyter book start\n\`\`\`\n\n## Saved website / 保存网站\n\n\`\`\`bash\njupyter book build --html\npython -m http.server 8000 --bind 127.0.0.1 --directory _build/html\n\`\`\`\n\nOpen http://127.0.0.1:8000 while the server is running. Rebuild after changing source or styles.\n在服务运行期间访问上述网址；修改正文或样式后需要重新构建。\n\n## Website colors / 网站配色\n\nKeep ${WEBSITE_THEME_PATH} beside myst.yml. The website's Light/Dark button switches the LanCarbon rose palettes.\n请保留与 myst.yml 同目录的 ${WEBSITE_THEME_PATH}；网站的主题按钮可切换深浅玫瑰粉配色。\n`);
  collectPageIds(book).forEach(pageId => {
    const page = book.pages[pageId];
    const note = workspace.notes.find(item => item.id === page.noteId);
    if (!note) throw new Error(`Page references a missing note: ${page.noteId}`);
    files.set(effectiveExportPath(book, page), renderPage(note, page));
  });
  return { files };
}
