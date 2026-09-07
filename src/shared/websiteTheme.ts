/** Standalone CSS exported through MyST's supported site.options.style hook. */
export const WEBSITE_THEME_PATH = "lancarbon-theme.css";
export const WEBSITE_FAVICON_PATH = "lancarbon-favicon.svg";
export const WEBSITE_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#f8eeee"/><text x="32" y="43" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="700" fill="#a76366">LC</text></svg>`;

export const WEBSITE_THEME_CSS = `/* LanCarbon website theme — light/dark colors shared with the desktop app. */
:root {
  color-scheme: light;
  --lc-ink: #352a2b;
  --lc-muted: #7d696b;
  --lc-paper: #fffafa;
  --lc-sidebar: #f8eeee;
  --lc-surface: #f0dddd;
  --lc-hover: #ead2d3;
  --lc-line: #e5d1d2;
  --lc-accent: #a76366;
  --lc-link: #925356;
  --lc-soft: #efd9da;
  --lc-selection: #efd9da;
  --lc-code: #f0dddd;
  --lc-code-line: #e5d1d2;
  --lc-warning: #956139;
  --lc-shadow: rgb(86 53 56 / 16%);
}
html:root.dark {
  color-scheme: dark;
  --lc-ink: #f1e8e8;
  --lc-muted: #b7a0a6;
  --lc-paper: #0b090a;
  --lc-sidebar: #151112;
  --lc-surface: #35272d;
  --lc-hover: #49363e;
  --lc-line: #88666f;
  --lc-accent: #b27777;
  --lc-link: #c99898;
  --lc-soft: #4a3134;
  --lc-selection: #4a3134;
  --lc-code: #503b42;
  --lc-code-line: #ad8390;
  --lc-warning: #bf8652;
  --lc-shadow: rgb(0 0 0 / 35%);
}
html:root body[class] { color: var(--lc-ink); background-color: var(--lc-paper); }
::selection { color: var(--lc-ink); background: var(--lc-selection); }
html:root :is(a, button, input, textarea, select, summary):focus-visible {
  outline: 2px solid var(--lc-accent) !important;
  outline-offset: 2px;
  --tw-ring-color: var(--lc-accent);
}
html:root :is(input, textarea, select) { accent-color: var(--lc-accent); }
html:root :is(.myst-top-nav, .myst-top-nav-bar, .myst-primary-sidebar-pointer) {
  color: var(--lc-ink); background-color: var(--lc-sidebar); border-color: var(--lc-line);
}
/* The desktop sidebar wrapper spans the viewport; only its actual column is filled. */
@media (max-width: 1279px) {
  html:root .myst-primary-sidebar { color: var(--lc-ink); background-color: var(--lc-sidebar); }
}
html:root :is(.myst-home-link, .myst-primary-sidebar-nav, .myst-toc, .myst-toc a, .myst-toc button,
  .myst-top-nav-menu-button, .myst-theme-button, .myst-outline-header) { color: var(--lc-ink); }
html:root :is(.myst-theme-button, .myst-search-bar, .myst-search-shortcut) { border-color: var(--lc-line); }
html:root :is(.myst-theme-button, .myst-search-bar) { color: var(--lc-ink); background: var(--lc-surface); }
html:root :is(.myst-theme-button, .myst-search-bar, .myst-top-nav-menu-button):hover {
  color: var(--lc-link); background: var(--lc-hover); border-color: var(--lc-accent); --tw-ring-color: var(--lc-accent);
}
html:root :is(.myst-search-text-placeholder, .myst-search-shortcut, .myst-made-with-myst,
  .myst-fm-date-string, .myst-footer-link-group) { color: var(--lc-muted); }
html:root .myst-made-with-myst:hover { color: var(--lc-link); }

/* Primary table of contents: parent, current page, hover and keyboard focus. */
html:root .myst-toc-item:hover, html:root .myst-toc-item button:hover { background-color: var(--lc-hover); }
html:root :is(.myst-toc-item-exact, .myst-toc-item.active) {
  color: var(--lc-link); background-color: var(--lc-soft);
}
html:root .myst-toc :is(a[class*="text-blue-"], .myst-toc-item-exact a, .myst-toc-item.active a) { color: var(--lc-link); }

/* In-page outline uses utility classes to mark the section in view in book-theme 1.x. */
html:root .myst-outline { color: var(--lc-muted); background-color: var(--lc-paper); }
html:root .myst-outline-item { border-left-color: var(--lc-line); }
html:root .myst-outline-item > a { color: var(--lc-muted); }
html:root .myst-outline-item:hover { border-left-color: var(--lc-accent); background-color: var(--lc-hover); }
html:root .myst-outline-item:hover > a { color: var(--lc-link); }
html:root .myst-outline-item:is([class*="border-l-blue-"], .active):not([class*="border-l-gray-"]),
html:root .myst-outline-item:has(> a[aria-current="location"]) { border-left-color: var(--lc-accent); background-color: var(--lc-soft); }
html:root .myst-outline-item > a:is([class*="text-blue-"], [aria-current="location"], .active) {
  color: var(--lc-link); background-color: var(--lc-soft);
}
html:root .myst-outline-collapsible:hover { background-color: var(--lc-hover); }

/* Override both normal and inverted typography palettes without changing layout. */
html:root :is(.article, .prose) {
  --tw-prose-body: var(--lc-ink);
  --tw-prose-headings: var(--lc-ink);
  --tw-prose-lead: var(--lc-muted);
  --tw-prose-links: var(--lc-link);
  --tw-prose-bold: var(--lc-ink);
  --tw-prose-counters: var(--lc-muted);
  --tw-prose-bullets: var(--lc-muted);
  --tw-prose-hr: var(--lc-line);
  --tw-prose-quotes: var(--lc-ink);
  --tw-prose-quote-borders: var(--lc-accent);
  --tw-prose-captions: var(--lc-muted);
  --tw-prose-kbd: var(--lc-ink);
  --tw-prose-kbd-shadows: var(--lc-line);
  --tw-prose-code: var(--lc-ink);
  --tw-prose-pre-code: var(--lc-ink);
  --tw-prose-pre-bg: var(--lc-code);
  --tw-prose-th-borders: var(--lc-line);
  --tw-prose-td-borders: var(--lc-line);
  color: var(--lc-ink);
}
html:root .myst-fm-block-title { color: var(--lc-ink); }
html:root :is(.article, .prose) :is(a:not(.myst-outline a):not(.myst-footer-link), .hover-link) {
  color: var(--lc-link); text-decoration-color: var(--lc-accent); border-color: var(--lc-accent);
}
html:root :is(.article, .prose) a:hover { color: var(--lc-accent); }
html:root :is(.article, .prose) dt > strong { color: var(--lc-link); }
html:root :is(.article, .prose) code:not(pre code):not(.myst-code code) {
  color: var(--lc-ink); background: var(--lc-code); padding: .12em .32em; border-radius: 4px;
}
html:root kbd, html:root kbd[class] {
  color: var(--lc-ink); background: var(--lc-code); border: 1px solid var(--lc-code-line);
  border-radius: 4px; padding: 2px 5px; box-shadow: none !important;
}
html:root :is(.myst-code, .myst-code-body, .myst-code pre, .myst-code code) {
  color: var(--lc-ink); background-color: var(--lc-code); border-color: var(--lc-code-line);
}
html:root .myst-code { box-shadow: 0 2px 6px var(--lc-shadow); }
html:root .myst-code-copy-icon { color: var(--lc-link); }
html:root .myst-code-copy-icon:hover { color: var(--lc-ink); background: var(--lc-hover); }
html:root .myst-code :is(.hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-title) { color: var(--lc-link); }
html:root .myst-code :is(.hljs-string, .hljs-attr, .hljs-attribute, .hljs-number, .hljs-literal) { color: var(--lc-ink); }
html:root .myst-code :is(.hljs-comment, .hljs-quote, .hljs-meta) { color: var(--lc-muted); }
html:root :is(.article, .prose) table :is(th, td, tr, thead, tbody) { border-color: var(--lc-line); }
html:root :is(.article, .prose) table th { color: var(--lc-ink); background: var(--lc-code); }
html:root :is(.article, .prose) table tr:hover td { background-color: var(--lc-hover); }
html:root .lc-align-left { text-align: left; }
html:root .lc-align-center { text-align: center; }
html:root .lc-align-right { text-align: right; }

/* MyST writes figure alignment as inline image margins. Keep its caption aligned
   with the image so the built website matches LanCarbon Preview. */
html:root .fig-figure > img[style*="margin-left:0"][style*="margin-right:auto"] + figcaption,
html:root .fig-figure > img[style*="margin-left: 0"][style*="margin-right: auto"] + figcaption { text-align: left; }
html:root .fig-figure > img[style*="margin-left:auto"][style*="margin-right:auto"] + figcaption,
html:root .fig-figure > img[style*="margin-left: auto"][style*="margin-right: auto"] + figcaption { text-align: center; }
html:root .fig-figure > img[style*="margin-left:auto"][style*="margin-right:0"] + figcaption,
html:root .fig-figure > img[style*="margin-left: auto"][style*="margin-right: 0"] + figcaption { text-align: right; }

/* Match the desktop's rose callouts, with its amber edge for warnings. */
html:root :is(.myst-admonition, .myst-dropdown) {
  color: var(--lc-ink); background-color: var(--lc-surface); border-color: var(--lc-accent);
  box-shadow: 0 2px 6px var(--lc-shadow);
}
html:root :is(.myst-admonition-header, .myst-dropdown-header) { color: var(--lc-link); background-color: var(--lc-soft); }
html:root :is(.myst-admonition-header-text, .myst-dropdown-header-title) { color: var(--lc-ink); }
html:root :is(.myst-admonition-warning, .myst-admonition-caution, .myst-admonition-danger) { border-left-color: var(--lc-warning); }
html:root :is(.myst-admonition-warning, .myst-admonition-caution, .myst-admonition-danger) > .myst-admonition-header { color: var(--lc-warning); }
html:root .myst-footer-link { color: var(--lc-ink); border-color: var(--lc-line); background: var(--lc-sidebar); }
html:root .myst-footer-link:hover { color: var(--lc-link); border-color: var(--lc-accent); background: var(--lc-soft); }

/* Menus and reference/author popovers are rendered in portals outside the article. */
html:root .hover-document { color: var(--lc-ink); background-color: var(--lc-sidebar); border-color: var(--lc-line); }
html:root :is([role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper] > div) {
  color: var(--lc-ink); background-color: var(--lc-sidebar); border-color: var(--lc-line);
}
html:root :is([role="dialog"], [role="menu"], [role="listbox"]) :is(input, textarea) {
  color: var(--lc-ink); background: var(--lc-surface); border-color: var(--lc-line);
}
html:root :is([role="option"][aria-selected="true"], [role="menuitem"]:hover, [role="menuitem"][data-highlighted]) {
  color: var(--lc-link); background: var(--lc-soft);
}
html:root :is([role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]) a { color: var(--lc-link); }
html:root :is(.primary-scrollbar, .myst-outline) { scrollbar-color: var(--lc-line) var(--lc-sidebar); }
`;

export const WEBSITE_THEME_GUIDE = `## Exported Website Theme / 导出网站主题

### Website appearance

LanCarbon exports a rose-colored website theme with every Book. The current page, expanded chapter, page outline, links and references, inline code, keyboard text, code blocks, tables and menus follow the desktop palette. The website's own Light/Dark button switches both palettes. Warning callouts retain the desktop's amber edge.

The export includes lancarbon-theme.css and configures it in myst.yml. Keep this file with the exported Book. Run jupyter book start to preview changes, or jupyter book build --html to rebuild the saved static website. A Python server reads the previously built files; refreshing it alone does not rebuild your Book.

For a newly exported Book, no manual styling is needed. Existing exports must receive the CSS and site.options.style configuration, then be rebuilt. This is website styling; it does not recolor browser tabs or address bars. No remote font or style download is introduced by the LanCarbon theme.

### 网站外观

LanCarbon 导出的每本 Book 都附带玫瑰粉色网站主题。当前页面、展开章节、页内目录、链接与引用、行内代码、按键、代码块、表格和菜单沿用桌面软件的配色。网站自身的 Light/Dark 按钮切换两套色板；警告框保留软件中的琥珀色提示边线。

导出内容包含 lancarbon-theme.css，myst.yml 会自动配置加载它。请将此文件与 Book 一起保留。使用 jupyter book start 预览，或运行 jupyter book build --html 更新已保存的静态网站。Python 服务读取的是上次构建结果，仅刷新网页不会重新构建。

新导出的 Book 无需手工设置。已有导出项目需补充 CSS 和 site.options.style 配置，再重新构建。这是网页内容的样式，不会改变浏览器标签栏或地址栏；LanCarbon 主题不会引入额外的远程字体或样式下载。`;
