import { addNoteToBook } from "./books";
import { createNote } from "./notes";
import type { WorkspaceFile } from "./types";

const tutorials = [
  { title: "Publishing Readiness", slug: "readiness", content: `## English

### Phase 5A checks

Open a Book and choose Publish. LanCarbon checks Git, GitHub CLI, GitHub authentication, the most recent managed Book build, the saved repository binding and GitHub Pages. Each result is shown as passed, warning or error.

Git and GitHub CLI must be available in PATH. LanCarbon uses the account already authenticated by GitHub CLI and does not store a GitHub password or access token in notes.json. If GitHub CLI is missing, use Open GitHub CLI Download. If it is installed but signed out, use Sign in with GitHub CLI, finish authentication in the visible terminal, then select Refresh Checks.

A current Book build is shown separately from the publishing prerequisites. It does not block repository setup. When publishing starts, LanCarbon creates or refreshes the managed build automatically if needed.

## 中文

### Phase 5A 检查

打开一本 Book 并点击 Publish。LanCarbon 会检查 Git、GitHub CLI、GitHub 登录状态、最近一次受管理构建、已保存的仓库绑定以及 GitHub Pages，并将结果显示为通过、警告或错误。

Git 与 GitHub CLI 必须能够通过 PATH 找到。LanCarbon 使用 GitHub CLI 已登录的账户，不会把 GitHub 密码或访问令牌写入 notes.json。GitHub CLI 缺失时点击 Open GitHub CLI Download；已经安装但未登录时点击 Sign in with GitHub CLI，在可见终端中完成认证，再点击 Refresh Checks。

当前 Book 的构建状态会与发布必备条件分开显示，并且不会阻止仓库配置。开始发布时，如果缺少构建或构建已经过期，LanCarbon 会自动创建或刷新受管理构建。` },
  { title: "GitHub and Pages Setup", slug: "github-pages", content: `## English

### Connect an existing repository

Choose Publish, select Existing repository, and enter the owner, repository name and publication branch. The default branch is gh-pages. Your authenticated account needs repository administration access. Connect and Initialize Pages verifies the repository, creates the publication branch from its default branch when necessary, and configures GitHub Pages to serve the branch root. Existing files and branches are retained.

### Create a repository

Select New repository, choose Public or Private, and enter the owner and repository name. Create Repository and Pages creates the repository with an initial README, prepares the publication branch, enables Pages and saves the binding only for this Book. Private repository Pages availability depends on the GitHub account and organization plan.

The connected repository URL is also written to Book settings and exported metadata. Open Repository and Open Pages use HTTPS. Reconfiguring a Book does not delete the old repository. If setup partly succeeds and Pages configuration fails, LanCarbon reports the repository URL so it can be inspected or reconnected; it never deletes the remote repository automatically.

Phase 5A and 5B stop after environment checks, repository binding and Pages initialization. Publishing or updating the generated Book website belongs to Phase 5C.

## 中文

### 连接已有仓库

点击 Publish，选择 Existing repository，填写 owner、仓库名和发布分支；默认分支为 gh-pages。当前登录账户需要具有仓库管理权限。Connect and Initialize Pages 会核对仓库，必要时从默认分支创建发布分支，并配置 GitHub Pages 从该分支根目录提供网站；原有文件和分支不会被删除。

### 创建新仓库

选择 New repository，设置 Public 或 Private，并填写 owner 与仓库名。Create Repository and Pages 会创建带初始 README 的仓库、准备发布分支、启用 Pages，并仅为当前 Book 保存绑定。私有仓库能否使用 Pages 取决于 GitHub 账户或组织套餐。

连接后的仓库网址也会写入 Book settings 和导出元数据。Open Repository 与 Open Pages 使用 HTTPS。更改绑定不会删除旧仓库。如果仓库已经创建、但 Pages 配置失败，LanCarbon 会显示仓库网址供检查或重新连接，不会自动删除远端仓库。

Phase 5A 与 5B 到环境检查、仓库绑定和 Pages 初始化为止；上传或更新实际 Book 网站属于 Phase 5C。` },
  { title: "Build and Publishing Workflow", slug: "build-publish-workflow", content: `## English

### Three independent outputs

LanCarbon stores the authoritative Book in its own data location. Build reads the latest saved Book directly; it does not read a manually exported folder. Export remains a separate way to create a source copy for backup or external editing, and its destination must be empty. Export is not required before Build or Publish.

### First build and later rebuilds

The first build uses Choose Location and Build and remembers a managed destination for this Book. Later, Rebuild Website reuses that location without opening a folder picker. Change Build Location is available when the managed website should move elsewhere. LanCarbon builds in a temporary folder and replaces the previous managed website only after success.

The Build panel compares the current Book with the source fingerprint saved by the last successful build. Build is up to date means the managed website matches the current pages, hierarchy and settings. Book changed — rebuild required means the Book was edited afterward. This state survives restarting LanCarbon.

### One-step online updates

Publish Website is used when the managed build is current. If the Book is new or changed, the action becomes Build and Publish Website or Rebuild and Update Website. LanCarbon saves the Book, validates it, rebuilds the managed website at its remembered location, creates the repository-specific Pages build, uploads it and verifies the deployed commit. Only a first build or a missing build location asks for a folder.

A failed rebuild keeps the previous local website and stops before publishing. A network or GitHub failure keeps the previous online website. Open Pages and Open Repository remain available for inspection.

## 中文

### 三种相互独立的输出

LanCarbon 自己的数据位置保存权威版本的 Book。Build 会直接读取软件中最新保存的 Book，不读取手动 Export 的文件夹。Export 继续用于生成备份或供外部编辑的源文件副本，目标文件夹必须为空；Build 和 Publish 之前都不需要先 Export。

### 首次构建与后续重建

第一次构建使用 Choose Location and Build，并为当前 Book 记住受管理的构建位置。以后点击 Rebuild Website 会直接复用该位置，不再打开文件夹选择器。需要移动构建网站时使用 Change Build Location。LanCarbon 始终先在临时文件夹构建，成功后才替换上一次受管理网站。

Build 面板会比较当前 Book 与上次成功构建保存的内容指纹。Build is up to date 表示受管理网站与当前页面、层级和设置一致；Book changed — rebuild required 表示 Book 在构建后又被修改。重启 LanCarbon 后该状态仍然有效。

### 一步完成在线更新

受管理构建为最新时使用 Publish Website。如果 Book 尚未构建或构建已经过期，按钮会变成 Build and Publish Website 或 Rebuild and Update Website。LanCarbon 会依次保存、检查、在已记住的位置重建、生成适合当前仓库地址的 Pages 版本、上传并核实实际部署提交。只有首次构建或原构建位置丢失时才需要选择文件夹。

重建失败时保留上一次本地网站，并停止发布；网络或 GitHub 失败时保留上一次线上网站。Open Pages 与 Open Repository 可随时用于检查。` },
  { title: "Publish and Update Website", slug: "publish", content: `## English

### First publish

Open Publish and confirm Git, GitHub CLI, account, repository and Pages all pass. If the managed build is current, select Publish Website. If it is missing, select Build and Publish Website and choose a build location once. LanCarbon prepares the managed build, downloads the connected publication branch into a temporary folder, replaces its website files with the saved _build/html output, adds .nojekyll, creates one Git commit and pushes it to the configured branch.

The local managed build and Book source stay unchanged. The temporary publishing folder is removed after success or failure. Publishing updates only the selected Book's connected branch; it does not delete the repository or alter other branches.

For a project site such as \`owner.github.io/repository\`, LanCarbon creates a separate publication build with \`BASE_URL=/repository\`. This makes styles, scripts, navigation and search work below the GitHub Pages subpath without changing the root-based local website.

### Later updates

After editing, select Rebuild and Update Website. LanCarbon refreshes the managed build first and then publishes it. If the built files changed, LanCarbon creates and pushes a new commit. If they are identical, no empty commit is created. The panel stores the verified commit and publication time and compares that commit with GitHub during later checks.

GitHub Pages may need a short time to show a new commit. Open Repository to inspect the branch or Open Pages to view the public site. A failed clone, commit or push leaves the remote website at its previous successful revision and reports the failed step.

## 中文

### 首次发布

打开 Publish，确认 Git、GitHub CLI、账号、仓库和 Pages 均通过。受管理构建为最新时点击 Publish Website；尚未构建时点击 Build and Publish Website，并只选择一次构建位置。LanCarbon 会准备受管理构建，把已连接的发布分支下载到临时目录，用保存的 _build/html 替换其中的网站文件，加入 .nojekyll，创建一次 Git 提交并推送到指定分支。

本地受管理构建与 Book 源文件不会改变。无论成功或失败，临时发布目录都会清理。发布只更新当前 Book 连接的分支，不会删除仓库，也不会修改其他分支。

对于 \`owner.github.io/repository\` 形式的项目站点，LanCarbon 会使用 \`BASE_URL=/repository\` 创建独立的发布构建，使样式、脚本、导航和搜索能够在 GitHub Pages 子路径下工作，同时不改变从根地址访问的本地网站。

### 后续更新

修改内容后点击 Rebuild and Update Website。LanCarbon 会先刷新受管理构建，再进行发布。构建文件有变化时会创建并推送新提交；内容完全相同时不会制造空提交。面板保存已核实的提交编号和发布时间，后续检查时会与 GitHub 上的分支进行比较。

GitHub Pages 显示新提交可能需要短暂时间。Open Repository 可检查分支，Open Pages 可打开公开网站。下载、提交或推送失败时，远端网站仍停留在上一次成功版本，面板会指出失败步骤。` },
  { title: "Phase 5 Acceptance", slug: "acceptance", content: `## English

### Phase 5D checklist

1. Confirm Git, GitHub CLI and GitHub account pass after restarting LanCarbon.
2. Open Build. For a new Book, choose a location and build once. Confirm the panel reports Build is up to date, then edit visible Book content and confirm it reports Book changed — rebuild required.
3. Connect or create a repository, initialize GitHub Pages and confirm the repository and Pages checks pass.
4. Select Build and Publish Website. Confirm LanCarbon rebuilds without another folder prompt, then shows a publication commit and enables both Open Repository and Open Pages.
5. Change visible Book content and select Rebuild and Update Website. Confirm the same Pages address shows the new content after GitHub finishes deploying it.
6. Select Update Website again without changing the Book. Confirm LanCarbon reports that the website is already up to date and does not create an empty commit.
7. Restart LanCarbon and refresh checks. Confirm the Book keeps its repository, branch, Pages URL, last publication time and verified revision.

Phase 5 is accepted when readiness, repository setup, first publication, repeat updates and restart recovery all pass. Publishing requires an internet connection and GitHub availability.

## 中文

### Phase 5D 验收清单

1. 重启 LanCarbon 后，确认 Git、GitHub CLI 和 GitHub 账号检查通过。
2. 打开 Build。新 Book 先选择位置并构建一次，确认面板显示 Build is up to date；随后修改一处可见内容，确认状态变为 Book changed — rebuild required。
3. 连接或创建仓库，初始化 GitHub Pages，确认仓库与 Pages 检查通过。
4. 点击 Build and Publish Website，确认 LanCarbon 不再询问文件夹便完成重建，随后显示发布提交，并且 Open Repository 与 Open Pages 均可使用。
5. 修改一处可见的 Book 内容，点击 Rebuild and Update Website；等待 GitHub 完成部署后，确认同一 Pages 地址显示新内容。
6. 不改 Book 内容，再次点击 Update Website；确认软件提示网站已是最新，并且没有创建空提交。
7. 重启 LanCarbon 并刷新检查，确认当前 Book 仍保留仓库、分支、Pages 地址、上次发布时间与已核实提交。

发布准备、仓库配置、首次发布、重复更新及重启恢复全部通过后，即完成 Phase 5 验收。在线发布需要网络连接且 GitHub 服务可用。` }
];

export function ensurePhase5Guide(workspace: WorkspaceFile): { workspace: WorkspaceFile; changed: boolean } {
  const original = workspace.books.find(book => book.phase2GuideRevision === 1);
  if (!original) return { workspace, changed: false };
  let book = original; const notes = workspace.notes.map(note => {
    const page = Object.values(original.pages).find(item => item.noteId === note.id);
    if (page?.metadata.label === "lancarbon-phase5-publish" && !note.content.includes("BASE_URL=/repository")) {
      return { ...note, content: `${note.content.trimEnd()}\n\n### GitHub Pages subpath / GitHub Pages 子路径\n\nFor a project site such as \`owner.github.io/repository\`, LanCarbon creates a separate publication build with \`BASE_URL=/repository\`. This makes styles, scripts, navigation and search work below the GitHub Pages subpath without changing the root-based local website.\n\n对于 \`owner.github.io/repository\` 形式的项目站点，LanCarbon 会使用 \`BASE_URL=/repository\` 创建独立的发布构建，使样式、脚本、导航和搜索能够在 GitHub Pages 子路径下工作，同时不改变从根地址访问的本地网站。` };
    }
    if (page?.metadata.label !== "lancarbon-phase5-index") return note;
    const content = note.content
      .replace("Phase 5A checks Git and GitHub readiness; Phase 5B connects a repository and initializes GitHub Pages. Uploading Book files begins in Phase 5C.", "Phase 5A checks publishing readiness; Phase 5B connects GitHub Pages; Phase 5C publishes and updates the built website; Phase 5D verifies the complete online workflow.")
      .replace("Phase 5A 检查 Git 与 GitHub 发布环境；Phase 5B 连接仓库并初始化 GitHub Pages。Book 文件上传从 Phase 5C 开始。", "Phase 5A 检查发布环境；Phase 5B 连接 GitHub Pages；Phase 5C 发布并更新构建网站；Phase 5D 验收完整在线流程。");
    return content === note.content ? note : { ...note, content };
  });
  const add = (title: string, slug: string, content: string, parent?: string) => {
    const label = `lancarbon-phase5-${slug}`;
    const existing = Object.values(book.pages).find(page => page.metadata.label === label); if (existing) return existing.id;
    const note = createNote({ title, content }); notes.push(note); book = addNoteToBook(book, note, parent ? { parentPageId: parent } : { section: true });
    const page = Object.values(book.pages).find(item => item.noteId === note.id)!; let exportPath = `guide/phase-5/${slug}.md`, suffix = 2;
    while (Object.values(book.pages).some(item => item.id !== page.id && item.exportPath === exportPath)) exportPath = `guide/phase-5/${slug}-${suffix++}.md`;
    book = { ...book, pages: { ...book.pages, [page.id]: { ...page, exportPath, metadata: { label } } } }; return page.id;
  };
  const parent = add("Phase 5 Reference", "index", "## English\n\nPhase 5 moves a successfully built local Book toward a durable online website. Phase 5A checks publishing readiness; Phase 5B connects GitHub Pages; Phase 5C publishes and updates the built website; Phase 5D verifies the complete online workflow.\n\n## 中文\n\nPhase 5 把已经成功构建的本地 Book 进一步变成可长期访问的在线网站。Phase 5A 检查发布环境；Phase 5B 连接 GitHub Pages；Phase 5C 发布并更新构建网站；Phase 5D 验收完整在线流程。");
  for (const item of tutorials) add(item.title, item.slug, item.content, parent);
  const notesChanged = notes.some((note, index) => note !== workspace.notes[index]);
  if (book === original && !notesChanged) return { workspace, changed: false };
  return { workspace: { ...workspace, notes, books: workspace.books.map(item => item.id === book.id ? book : item) }, changed: true };
}
