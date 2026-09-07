import { addNoteToBook } from "./books";
import { createNote } from "./notes";
import type { WorkspaceFile } from "./types";

const tutorials = [
  { title: "Images and Screenshots", slug: "images", content: `## English

### Insert an image

In Edit, choose Insert image above the formatting toolbar. PNG, JPEG, GIF and WebP are supported, up to 20 MB each. You can also drop an image into the editor or paste a screenshot from the clipboard. Ordinary text paste continues to work normally.

The image is copied into the data folder shown by Data Location. LanCarbon inserts a Markdown image reference at the cursor; edit the text between square brackets to change its description. Switch to Preview to see the local copy. Moving or deleting the original file does not affect it.

### Reuse and verify

Open Resources, find the file and choose Insert. Identical files share one managed copy, even if imported under another name. Different files with the same name remain separate. Undo removes the inserted Markdown while keeping the resource available for reuse.

Check both themes, restart the app and reopen Preview. If a managed file is missing or damaged, re-import the original file. Remote image URLs and arbitrary local file paths are not loaded by the desktop preview. SVG is handled as an attachment rather than an inline image.

## 中文

### 插入图片

在 Edit 模式点击格式工具栏上方的 Insert image。支持 PNG、JPEG、GIF、WebP，每张不超过 20 MB。也可以将图片拖入编辑区，或从剪贴板粘贴截图；普通文字粘贴仍正常工作。

图片会复制到 Data Location 所示的数据目录，正文光标处插入 Markdown 图片引用。修改方括号内文字可调整图片描述，切换 Preview 查看本地副本。移动或删除原文件不会影响已导入的图片。

### 复用与检查

打开 Resources，找到文件后点击 Insert。相同内容复用一份资源，不同内容即使文件名相同也会分别保存。撤销插入只移除正文引用，资源仍保留供复用。

切换深浅主题、重启软件，再次检查预览。资源缺失或损坏时重新导入原文件即可恢复。桌面预览不加载远程图片或任意本地路径；SVG 作为附件保存，不直接显示为图片。` },
  { title: "Attachments and Resource Export", slug: "attachments", content: `## English

### Attach and manage files

Choose Attach file in Edit to import a PDF, document, spreadsheet or other file (up to 100 MB). Dropping files into the editor also imports them. The Markdown link uses a managed copy; Preview links and Resources → Save a copy let you save the file to another location without launching it automatically.

Resources lists images and attachments across your notes and Books. Search by name, reuse a file with Insert, and expand its reference count to inspect note titles and line numbers. A resource with no references is retained. The checker covers managed Markdown image/link destinations, reference definitions and MyST image/figure arguments; literal code examples are ignored. Missing files are marked in the list.

### Export and move

Export a Book into an empty folder. Referenced resources are copied into assets/, and links in nested pages are adjusted relative to each page. Shared files are copied once; unrelated resources are excluded. The desktop source stays unchanged. Export stops with a message if a required managed file is missing or damaged.

Build with jupyter book build --html --strict, then view the saved website with a local HTTP server. Move the whole exported project, including assets/ and the website theme files. Test an image and an attachment link after moving it.

Data Location migration also copies the resource catalog and files. For backups, keep notes.json, assets.json and assets/ together. Bibliography management is covered in the Citations and Bibliographies page.

### Acceptance

1. Import an image and a document, then move the original files elsewhere.
2. Restart and verify the image; save an attachment copy and compare it with the original.
3. Reuse a resource on a nested Book page and inspect its references.
4. Export, build, move the export and verify both links again.

## 中文

### 插入和管理附件

在 Edit 点击 Attach file，可导入 PDF、文档、表格等文件，每个不超过 100 MB；也支持拖入编辑区。Markdown 链接引用软件保存的副本。点击 Preview 中的附件链接，或 Resources 中的 Save a copy，可另存文件，不会自动启动附件程序。

Resources 汇总所有笔记和 Book 的图片与附件。可以按名称搜索、点击 Insert 复用，并展开引用次数查看笔记标题和行号。零引用资源仍保留。检查覆盖受管理的 Markdown 图片与链接目标、引用定义和 MyST image/figure 参数，忽略代码示例中的字面引用；缺失文件会明确标注。

### 导出与移动

将 Book 导出到空目录，引用的资源会复制到 assets/，嵌套页面的链接会转换为相对于该页面的路径。共用资源只复制一次，无关资源不导出，软件中的 Markdown 原文保持不变。必要资源缺失或损坏时，导出会停止并提示重新导入。

使用 jupyter book build --html --strict 构建，再通过本地 HTTP 服务查看。移动导出项目时保留整个文件夹，包括 assets/ 和网站主题文件，并重新检查图片及附件链接。

更改 Data Location 时会一起复制资源目录和清单。手动备份需同时保留 notes.json、assets.json 和 assets/。文献管理请参阅 Citations and Bibliographies 页面。

### 验收

1. 导入一张图片和一个文档，然后移动原文件。
2. 重启检查图片，另存附件副本并与原文件比较。
3. 在 Book 的嵌套页面复用资源，检查引用位置。
4. 导出、构建、移动整个导出目录，再次验证图片和附件。` }
];
const remainingTutorials=[
 {title:"Citations and Bibliographies",slug:"citations",content:`## English

### Import and cite

Open a Book page in Edit and choose Citations. Import a UTF-8 BibTeX .bib file (up to 5 MB). The library is stored as a managed hashed resource and associated with this Book. Search by author, title, year or citation key, select one or more entries, then insert a parenthetical citation. A single entry can also be inserted as a narrative citation.

LanCarbon writes standard MyST/Pandoc syntax: \`@key\` for narrative citations and \`[@key; @other]\` for grouped parenthetical citations. Preview shows author–year text and the page's cited references. Removing a library from a Book keeps its managed resource; deleting it in Resources removes the Book association.

### Export

Export adds the managed .bib path to project.bibliography in myst.yml and copies the source into assets/. Missing or duplicate citation keys stop export. The official Jupyter Book build produces the final citations and bibliography.

## 中文

### 导入与引用

在 Book 页面 Edit 模式点击 Citations，导入 UTF-8 BibTeX .bib 文件（不超过 5 MB）。文献库作为哈希命名的受管理资源保存，并关联当前 Book。可按作者、标题、年份或引用键搜索；选择一项或多项后插入括号式引用，单项也可插入叙述式引用。

LanCarbon 写入标准 MyST/Pandoc 语法：叙述式为 \`@key\`，多篇括号式为 \`[@key; @other]\`。Preview 显示作者—年份和当前页面引用的参考文献。从 Book 移除文献库不会删除资源；在 Resources 删除资源则会清除 Book 关联。

### 导出

导出时会在 myst.yml 的 project.bibliography 写入受管理 .bib 路径，并把源文件复制到 assets/。引用键缺失或重复时阻止导出；最终引用和参考文献格式以官方 Jupyter Book 构建为准。`},
 {title:"Phase 3 Acceptance",slug:"acceptance",content:`## English

1. Import an image, attachment and UTF-8 .bib file into a disposable Book.
2. Adjust image width, alignment, description and caption; verify both desktop themes and Preview.
3. Insert narrative, parenthetical and grouped citations. Confirm author–year text and References in Preview.
4. Open Citations and confirm Book validation passes. Add a missing key temporarily and confirm validation and export reject it, then correct it.
5. Restart and verify resource references, image settings, bibliography association and citations remain.
6. Export to an empty folder. Confirm myst.yml contains project.bibliography and assets/ contains only required resources.
7. Run jupyter book build --html --strict and check the generated website's images, downloads, citations and bibliography.
8. Test Resources filtering and permanent deletion on disposable data. Confirm references and Book resource settings are removed together.

Phase 3 is accepted when every check passes without changing the original imported files. Attachment reading, executable notebooks, built-in CLI serving and publishing remain later work.

## 中文

1. 在临时 Book 中导入图片、附件和 UTF-8 .bib 文件。
2. 调整图片宽度、对齐、描述和图注，检查两种桌面主题及 Preview。
3. 插入叙述式、括号式和多篇组合引用，检查作者—年份及 References。
4. 在 Citations 确认 Book validation 通过；临时加入缺失引用键，确认校验和导出会阻止，再修正。
5. 重启后检查资源引用、图片设置、文献库关联和引用仍存在。
6. 导出到空目录，确认 myst.yml 包含 project.bibliography，assets/ 只包含所需资源。
7. 运行 jupyter book build --html --strict，检查生成网站的图片、下载、引用和参考文献。
8. 在临时数据上检查 Resources 筛选和永久删除，确认引用及 Book 资源设置同步清除。

全部通过后 Phase 3 验收完成。附件内阅读、可执行 Notebook、内置 CLI 服务和发布仍属于后续工作。`}
];

export function ensurePhase3Guide(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const original = workspace.books.find(book => book.phase2GuideRevision === 1);
  if (!original) return {workspace,changed:false};
  let book = original;
  let notes = [...workspace.notes];
  let notesChanged = false;
  const add = (title: string, slug: string, content: string, parent?: string) => {
    const label = `lancarbon-phase3-${slug}`;
    const existing = Object.values(book.pages).find(page => page.metadata.label === label);
    if (existing) return existing.id;
    const note = createNote({title,content}); notes.push(note);
    book = addNoteToBook(book,note,parent ? {parentPageId:parent} : {section:true});
    const page = Object.values(book.pages).find(p => p.noteId === note.id)!;
    let exportPath = `guide/phase-3/${slug}.md`, suffix = 2;
    while (Object.values(book.pages).some(p => p.id !== page.id && p.exportPath === exportPath)) exportPath = `guide/phase-3/${slug}-${suffix++}.md`;
    book = {...book,pages:{...book.pages,[page.id]:{...page,exportPath,metadata:{label}}}};
    return page.id;
  };
  const parent = add("Phase 3 Reference","index","## English\n\nPhase 3 covers managed images, attachments, bibliography workflows and portable Jupyter Book export. Read the tutorials and complete Phase 3 Acceptance.\n\n## 中文\n\nPhase 3 包含受管理图片、附件、文献引用和可移动的 Jupyter Book 导出。请阅读教程并完成 Phase 3 Acceptance。");
  notes=notes.map(note=>{if(note.id!==book.pages[parent].noteId||note.content.includes("Phase 3C + 3D complete"))return note;notesChanged=true;return {...note,content:note.content+"\n\n## Phase 3C + 3D complete / Phase 3C + 3D 已完成\n\nBibliography management, citation preview/export and Phase 3 validation are now available. See the two new pages below.\n\n文献库管理、引用预览与导出、Phase 3 校验现已提供。请阅读下方新增的两篇内容。"};});
  for (const item of [...tutorials,...remainingTutorials]) {
    const pageId = add(item.title,item.slug,item.content,parent);
    const marker = "## Resource tools update (1.8.1) / 资源工具更新";
    const extra = item.slug === "images"
      ? "In Edit, open Image settings, select an image occurrence and set Width (for example 50% or 600px), Alignment, Description and optional Caption. Apply saves a MyST image/figure block; Cancel leaves the source unchanged. Preview and exported Books retain the settings. Each occurrence has independent settings; the original image is not resized.\n\n在 Edit 点击 Image settings，选择本次要调整的图片，设置 Width（如 50% 或 600px；留空自动）、Alignment（左／中／右）、Description 和可选 Caption。Apply 保存，Cancel 取消；预览和导出的 Book 都保留设置。同一图片的不同引用可分别设置，原始文件不会缩小。"
      : "Same-name imports now ask: Replace existing updates ALL references to the managed resource; Keep both adds a numbered display name; Cancel imports nothing. Physical filenames remain hashes.\n\nResources → Show resources separates ordinary Notes from Books. Select one Book, one ordinary note, or Unreferenced; use the checkboxes and Delete selected for a batch. Delete checks references across the entire workspace, including other Books and Book logos, before asking for confirmation. Removing Markdown links retains resources. Confirmed resource deletion removes the managed file permanently; source links are left unchanged and will show missing-resource notices. Shared identical bytes stay on disk while another resource record still needs them. Original imported files and previously exported Books are unaffected. Attachment reading remains a future feature.\n\n同名导入现在弹出三个选项：Replace existing 替换所有原引用使用的资源；Keep both 给新资源显示名添加 (2)、(3) 等序号；Cancel 取消。磁盘继续使用哈希文件名。\n\nResources → Show resources 区分普通 Notes 和 Books，可选某本书、某篇普通笔记或 Unreferenced（未引用）。勾选资源后点击 Delete selected 批量删除，单个资源也有 Delete。删除提示检查整个工作区的引用，包括其他书籍及书籍图标。仅删除正文链接会保留资源；确认永久删除资源才清除托管文件，正文中的旧链接不会自动改写，会提示资源缺失。若另一条资源记录仍共用相同文件，该文件会保留至最后一条记录被删除。电脑上的原始导入文件和已经导出的 Book 不受影响。软件内附件阅读留待后续开发。";
    notes = notes.map(note => {
      if (note.id !== book.pages[pageId].noteId) return note;
      let content=note.content;
      if(!content.includes(marker))content+="\n\n"+marker+"\n\n"+extra;
      const deletionMarker="## Deletion update (1.8.2) / 删除行为更新";
      if(item.slug==="attachments"&&!content.includes(deletionMarker))content+="\n\n"+deletionMarker+"\n\nFrom 1.8.2, confirming resource deletion also removes its image/link occurrences and image/figure blocks from ALL Notes and Books, and clears matching Book logos/favicons. Surrounding prose and literal code examples remain. This supersedes the 1.8.1 behavior described above. Removing only a link still keeps the resource.\n\n从 1.8.2 起，确认删除资源会同时移除所有笔记和 Book 中对应的图片、附件链接和 image/figure 图片块，并清除对应的书籍图标设置；周围正文和代码示例保留。此规则取代上文 1.8.1 的旧删除行为。仅删除正文引用仍保留资源文件。";
      if(content===note.content)return note;
      notesChanged = true;
      return {...note,content};
    });
  }
  return book === original && !notesChanged ? {workspace,changed:false} : {workspace:{...workspace,notes,books:workspace.books.map(item=>item.id === book.id ? book : item)},changed:true};
}
