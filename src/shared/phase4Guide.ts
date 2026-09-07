import { addNoteToBook } from "./books";
import { createNote } from "./notes";
import type { WorkspaceFile } from "./types";

const tutorials = [
  { title: "Book Preflight", slug: "preflight", content: `## English

### Run the check

Open a Book and choose Build. LanCarbon checks every page before it starts Jupyter Book. The panel groups errors and warnings and shows the page and line when available. Select a located issue to open that page in Edit.

Errors block Build. They include invalid or duplicate export paths, missing pages, unsupported Notebook pages, malformed YAML frontmatter, duplicate or unresolved common cross-references, missing citation keys, and missing or damaged managed resources. Warnings identify empty pages, a missing Book author, or other items that can still produce a website.

The preflight is intentionally conservative. The official strict Jupyter Book build remains the final syntax check and can report MyST features that the local checker does not interpret.

## 中文

### 运行检查

打开一本 Book 并点击 Build。LanCarbon 会在启动 Jupyter Book 前检查全部页面。面板按错误和警告显示结果；能够定位时会显示页面与行号，点击该项可在 Edit 中打开对应页面。

错误会阻止 Build，包括无效或重复导出路径、页面缺失、尚不支持的 Notebook 页面、YAML frontmatter 格式错误、常见交叉引用重复或无法解析、引用键缺失，以及受管理资源缺失或损坏。警告包括空页面、未填写 Book 作者等仍可生成网站的项目。

预检采用谨慎规则，最终语法结果仍以官方 Jupyter Book 严格构建为准；CLI 可能发现本地检查器未解释的 MyST 功能。` },
  { title: "Build and Saved Website", slug: "build", content: `## English

### Build inside LanCarbon

After preflight passes, choose a parent folder. LanCarbon creates one managed subfolder named \`Book Title-Built\`, exports the current source and resources there, and runs:

    jupyter book build --html --strict --ci

Jupyter Book 2 must be installed and the jupyter command must be available in PATH. The build panel shows completion time, saved HTML path, CLI diagnostics and the full command output when available.

### Safe rebuilds and saved output

A rebuild is prepared in a temporary sibling folder. Only after Jupyter Book creates _build/html/index.html does LanCarbon replace the previous managed build. A failed build removes its temporary files and leaves the last successful website intact. LanCarbon refuses to replace a folder that does not carry the matching managed-build marker.

After a successful Build, the result panel shows a local 127.0.0.1 website address and an Open Website button. The address works while LanCarbon is running. Open Build Folder to inspect the source project and _build/html; these files remain on disk after LanCarbon and PowerShell close.

## 中文

### 在 LanCarbon 内构建

预检通过后选择一个父目录。LanCarbon 会创建名为 \`Book 标题-Built\` 的受管理子目录，把当前正文及资源导出到其中，并运行：

    jupyter book build --html --strict --ci

电脑需要安装 Jupyter Book 2，并能通过 PATH 找到 jupyter 命令。构建面板显示耗时、HTML 保存路径、CLI 诊断，并在可用时提供完整命令输出。

### 安全重建与长期保存

重新构建先在同级临时目录完成。只有 Jupyter Book 成功生成 _build/html/index.html 后，LanCarbon 才替换上一次受管理构建。失败时清理临时文件，保留上一次成功网站。没有匹配管理标记的目录不会被覆盖。

Build 成功后，结果面板会显示本地 127.0.0.1 网站地址和 Open Website 按钮；该地址在 LanCarbon 运行期间有效。点击 Open Build Folder 可查看导出源文件和 _build/html，关闭 LanCarbon 或 PowerShell 后这些文件仍会保留。` },
  { title: "Local Website", slug: "website", content: `## English

### Start, open and stop

A successful Build starts the saved website automatically. Select its 127.0.0.1 address or Open Website to open it in your normal browser. LanCarbon chooses a free port, so an existing service on port 3000 is not interrupted. Only this computer can reach the address.

Stop Website ends the local service without deleting the build. Start Website serves the same saved _build/html again without rebuilding. After restarting LanCarbon, open Build and select Start Website to restore an address for the last successful build.

Rebuilding keeps the previous website available until the new strict build succeeds. The local address is a viewing service, while the managed build folder is the durable copy. Closing LanCarbon stops its website services; it does not delete the saved files.

## 中文

### 启动、打开与停止

Build 成功后会自动启动已保存的网站。点击 127.0.0.1 地址或 Open Website，可在默认浏览器中打开。LanCarbon 自动选择空闲端口，不会中断已经占用 3000 端口的服务；该地址只能由当前电脑访问。

Stop Website 只停止本地服务，不删除构建结果。Start Website 可以直接重新提供同一份 _build/html，无需再次构建。重启 LanCarbon 后，打开 Build 并点击 Start Website，即可为上一次成功构建恢复网址。

重新构建时，上一次网站会保留到新的严格构建成功为止。本地网址用于查看，受管理构建文件夹才是长期保存的副本。关闭 LanCarbon 会停止由它启动的网站服务，但不会删除保存的文件。` },
  { title: "Phase 4 Acceptance", slug: "acceptance", content: `## English

### Phase 4D checklist

1. Open an existing Book and run Build. Confirm preflight reports page, reference, citation and resource problems before the CLI starts.
2. Correct every blocking error. Confirm warnings can remain and a successful strict build reports 0 errors unless the CLI reports a real failure.
3. Confirm the managed folder contains .lancarbon-build.json and _build/html/index.html. Open several pages, images, downloads, cross-references and citations in the local website.
4. Use Stop Website, then Start Website. Confirm stopping does not delete files and the restored address serves the same website.
5. Restart LanCarbon, reopen Build and start the saved website without rebuilding. An unrelated local server, including port 3000, must remain available.
6. Make a disposable syntax error and rebuild. Confirm the new build fails, its real diagnostic remains visible, retry stays available, and the last successful files remain intact.
7. Remove the syntax error, rebuild, and confirm the website changes only after success. Expand Jupyter Book output when full CLI evidence is needed.

Phase 4 is accepted when the checks, safe build, saved output and local website lifecycle all pass. Publishing to a remote host and executable notebooks remain later work.

## 中文

### Phase 4D 验收清单

1. 打开已有 Book 并运行 Build，确认 CLI 启动前会检查页面、引用、文献和资源问题，并尽量显示页面与行号。
2. 修正全部阻断错误；警告可以保留。严格构建成功时应显示 0 errors，除非 CLI 确实报告失败。
3. 确认受管理目录包含 .lancarbon-build.json 和 _build/html/index.html；在本地网站中检查多个页面、图片、附件下载、交叉引用和文献引用。
4. 依次使用 Stop Website 和 Start Website，确认停止服务不会删除文件，恢复后的地址仍提供同一网站。
5. 重启 LanCarbon，重新打开 Build，不重新构建即可启动已保存网站；其他本地服务（包括 3000 端口）应继续可用。
6. 在可丢弃内容中制造语法错误并重新构建，确认新构建失败、真实诊断可见、可以立即重试，并保留上一次成功文件。
7. 删除语法错误并重新构建，确认只有成功后网站才更新；需要完整 CLI 证据时展开 Jupyter Book output。

检查、可靠构建、长期保存结果及本地网站生命周期全部通过后，即完成 Phase 4 验收。远程发布和可执行 Notebook 仍属于后续工作。` }
];

const OFFLINE_THEME_NOTE = `

<!-- lancarbon-offline-theme-runtime-1 -->
### Bundled Book Theme

LanCarbon includes a verified official Book Theme runtime snapshot. The first Build prepares it in LanCarbon's persistent cache; later builds reuse that cache instead of downloading the template from GitHub. The installed Jupyter Book 2 command is still responsible for parsing and building the Book.

After a build, LanCarbon closes only the temporary theme service created for that build. A local website that was already running, including one on port 3000, is left intact.

### 内置 Book Theme

LanCarbon 附带经过验证的官方 Book Theme 运行时快照。第一次 Build 会在软件的持久缓存中准备该运行时，后续构建直接复用，不再从 GitHub 下载模板。本机安装的 Jupyter Book 2 命令仍负责解析并构建 Book。

构建结束后，LanCarbon 只关闭本次构建创建的临时主题服务；原本已经运行的本地网站（包括 3000 端口上的服务）不会被关闭。`;

export function ensurePhase4Guide(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const original = workspace.books.find(book => book.phase2GuideRevision === 1);
  if (!original) return { workspace, changed: false };
  let book = original; const notes = workspace.notes.map(note => {
    const page = Object.values(original.pages).find(item => item.noteId === note.id);
    if (page?.metadata.label === "lancarbon-phase4-index") {
      const content = note.content
        .replace("Phase 4A provides whole-Book preflight; Phase 4B runs the official Jupyter Book CLI while preserving the last successful build.", "Phase 4A provides whole-Book preflight; Phase 4B runs safe managed builds; Phase 4C controls the local saved website; Phase 4D supplies the complete acceptance checklist.")
        .replace("Phase 4A 提供整本书预检；Phase 4B 调用官方 Jupyter Book CLI，并保留上一次成功构建。", "Phase 4A 提供整本书预检；Phase 4B 执行可靠的受管理构建；Phase 4C 管理已保存的本地网站；Phase 4D 提供完整验收清单。");
      return content === note.content ? note : { ...note, content };
    }
    if (page?.metadata.label === "lancarbon-phase4-build") {
      const content = note.content
        .replace("After preflight passes, choose a parent folder. LanCarbon creates one managed subfolder named from the Book title and its short internal ID, exports the current source and resources there, and runs:", "After preflight passes, choose a parent folder. LanCarbon creates one managed subfolder named `Book Title-Built`, exports the current source and resources there, and runs:")
        .replace("预检通过后选择一个父目录。LanCarbon 会用 Book 标题和简短内部 ID 创建独立的受管理子目录，把当前正文及资源导出到其中，并运行：", "预检通过后选择一个父目录。LanCarbon 会创建名为 `Book 标题-Built` 的受管理子目录，把当前正文及资源导出到其中，并运行：")
        .replace("Open Build Folder to inspect the source project and _build/html. These files remain on disk after LanCarbon and PowerShell close. Opening them as a website still requires a local HTTP service; service controls belong to Phase 4C.", "After a successful Build, the result panel shows a local 127.0.0.1 website address and an Open Website button. The address works while LanCarbon is running. Open Build Folder to inspect the source project and _build/html; these files remain on disk after LanCarbon and PowerShell close.")
        .replace("点击 Open Build Folder 可查看导出源文件和 _build/html。关闭 LanCarbon 或 PowerShell 后这些文件仍会保留；若要按网站方式打开，仍需本地 HTTP 服务，服务控制属于 Phase 4C。", "Build 成功后，结果面板会显示本地 127.0.0.1 网站地址和 Open Website 按钮；该地址在 LanCarbon 运行期间有效。点击 Open Build Folder 可查看导出源文件和 _build/html，关闭 LanCarbon 或 PowerShell 后这些文件仍会保留。");
      if (!content.includes("lancarbon-offline-theme-runtime-1")) return { ...note, content: `${content.trimEnd()}${OFFLINE_THEME_NOTE}` };
      return content === note.content ? note : { ...note, content };
    }
    if (page?.metadata.label !== "lancarbon-phase3-citations") return note;
    const content = note.content
      .replace("syntax: @key for narrative citations and [@key; @other] for grouped parenthetical citations", "syntax: `@key` for narrative citations and `[@key; @other]` for grouped parenthetical citations")
      .replace("语法：叙述式为 @key，多篇括号式为 [@key; @other]", "语法：叙述式为 `@key`，多篇括号式为 `[@key; @other]`");
    return content === note.content ? note : { ...note, content };
  });
  const add = (title: string, slug: string, content: string, parent?: string) => {
    const label = `lancarbon-phase4-${slug}`;
    const existing = Object.values(book.pages).find(page => page.metadata.label === label); if (existing) return existing.id;
    const note = createNote({ title, content }); notes.push(note); book = addNoteToBook(book, note, parent ? { parentPageId: parent } : { section: true });
    const page = Object.values(book.pages).find(item => item.noteId === note.id)!; let exportPath = `guide/phase-4/${slug}.md`, suffix = 2;
    while (Object.values(book.pages).some(item => item.id !== page.id && item.exportPath === exportPath)) exportPath = `guide/phase-4/${slug}-${suffix++}.md`;
    book = { ...book, pages: { ...book.pages, [page.id]: { ...page, exportPath, metadata: { label } } } }; return page.id;
  };
  const parent = add("Phase 4 Reference", "index", "## English\n\nPhase 4 turns exported Books into checked and built websites. Phase 4A provides whole-Book preflight; Phase 4B runs safe managed builds; Phase 4C controls the local saved website; Phase 4D supplies the complete acceptance checklist.\n\n## 中文\n\nPhase 4 把导出的 Book 进一步变成经过检查并完成构建的网站。Phase 4A 提供整本书预检；Phase 4B 执行可靠的受管理构建；Phase 4C 管理已保存的本地网站；Phase 4D 提供完整验收清单。");
  for (const item of tutorials) add(item.title, item.slug, item.content, parent);
  const buildPage = Object.values(book.pages).find(page => page.metadata.label === "lancarbon-phase4-build");
  const buildNoteIndex = buildPage ? notes.findIndex(note => note.id === buildPage.noteId) : -1;
  if (buildNoteIndex >= 0 && !notes[buildNoteIndex].content.includes("lancarbon-offline-theme-runtime-1")) {
    notes[buildNoteIndex] = { ...notes[buildNoteIndex], content: `${notes[buildNoteIndex].content.trimEnd()}${OFFLINE_THEME_NOTE}` };
  }
  const notesChanged = notes.some((note, index) => note !== workspace.notes[index]);
  if (book === original && !notesChanged) return { workspace, changed: false };
  return { workspace: { ...workspace, notes, books: workspace.books.map(item => item.id === book.id ? book : item) }, changed: true };
}
