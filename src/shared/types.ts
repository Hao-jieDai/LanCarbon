export type Theme = "light" | "dark";
export type NoteFilter = "all" | "pinned";
export type SaveState = "saved" | "saving" | "error";

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BookAuthor {
  name: string;
}

export interface BibliographyEntry { key:string; type:string; title:string; authors:string[]; year:string; container?:string; doi?:string }
export interface BibliographySource { assetId:string; name:string; entries:BibliographyEntry[] }

export interface GitHubPublishingBinding {
  repository: string;
  repositoryUrl: string;
  pagesUrl?: string;
  branch: string;
  visibility: "PUBLIC" | "PRIVATE";
  initializedAt: string;
  lastPublishedAt?: string;
  lastCommit?: string;
}

export interface BookSettings {
  title: string;
  subtitle?: string;
  description?: string;
  authors: BookAuthor[];
  github?: string;
  license?: string;
  keywords: string[];
  siteTitle?: string;
  logo?: string;
  favicon?: string;
  bibliography?: BibliographySource[];
  publishing?: GitHubPublishingBinding;
}

export interface PageMetadata {
  shortTitle?: string;
  description?: string;
  authors?: BookAuthor[];
  date?: string;
  keywords?: string[];
  label?: string;
}

export type PageSourceType = "markdown" | "notebook";

export interface BookPage {
  id: string;
  noteId: string;
  sourceType: PageSourceType;
  exportPath: string;
  showInToc: boolean;
  metadata: PageMetadata;
  children: string[];
}

export interface Book {
  id: string;
  phase2GuideRevision?: 1;
  settings: BookSettings;
  pages: Record<string, BookPage>;
  rootPageIds: string[];
  homePageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFile {
  version: 2;
  notes: Note[];
  books: Book[];
}

export type LoadWorkspaceResult =
  | { ok: true; workspace: WorkspaceFile; isFirstRun: boolean; migrated: boolean }
  | { ok: false; workspace: WorkspaceFile; isFirstRun: boolean; migrated: false; error: string };

export type OperationResult = { ok: true } | { ok: false; error: string };
export type ExportBookResult = { ok: true; destination: string } | { ok: false; canceled?: boolean; error: string };
export interface BookCheckIssue {
  severity: "error" | "warning";
  source: "preflight" | "jupyter-book";
  code: string;
  message: string;
  pageId?: string;
  noteId?: string;
  pageTitle?: string;
  line?: number;
}
export type ValidateBookResult = { ok: true; issues: BookCheckIssue[] } | { ok: false; error: string };
export interface BuildEnvironmentCheck {
  id: "python" | "node" | "jupyter-book";
  label: string;
  status: "pass" | "error";
  detail: string;
}
export type BuildEnvironmentResult = { ok: true; checks: BuildEnvironmentCheck[] } | { ok: false; error: string };
export type EnvironmentToolId = "python" | "node" | "jupyter-book" | "git" | "github-cli";
export type EnvironmentItemId = EnvironmentToolId | "tools-permission" | "github-auth" | "github-network";
export interface EnvironmentSetupItem {
  id: EnvironmentItemId;
  label: string;
  status: "pass" | "warning" | "error";
  detail: string;
  version?: string;
  path?: string;
  source?: "managed" | "system";
  requirement: string;
  downloadSize?: string;
  installable: boolean;
  repairable?: boolean;
}
export type EnvironmentSetupResult = { ok: true; root: string; toolsPath: string; logPath: string; items: EnvironmentSetupItem[] } | { ok: false; error: string };
export type EnvironmentInstallResult = { ok: true; item: EnvironmentSetupItem } | { ok: false; canceled?: boolean; error: string };
export interface EnvironmentInstallProgress {
  tool: EnvironmentToolId;
  phase: "preparing" | "downloading" | "verifying" | "installing" | "checking" | "canceling";
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
}
export type BuildBookResult =
  | { ok: true; destination: string; htmlPath: string; url: string; issues: BookCheckIssue[]; log: string; durationMs: number; sourceStatus?: "current" }
  | { ok: false; canceled?: boolean; error: string; issues?: BookCheckIssue[]; log?: string };
export type BookWebsiteResult =
  | { ok: true; built: false; running: false }
  | { ok: true; built: true; running: boolean; htmlPath: string; url?: string; destination?: string; builtAt?: string; sourceStatus?: "current" | "outdated" }
  | { ok: false; error: string };
export type DataLocationResult = { ok: true; path: string } | { ok: false; canceled?: boolean; error: string };
export interface GitHubCheck {
  id: "git" | "gh" | "auth" | "github-api" | "build" | "repository" | "git-network" | "pages" | "publication";
  label: string;
  status: "pass" | "warning" | "error";
  detail: string;
}
export type GitHubPublishingStatusResult = { ok: true; checks: GitHubCheck[]; account?: string; buildStatus?: "missing" | "outdated" | "current" } | { ok: false; error: string };
export interface GitHubSetupRequest {
  mode: "existing" | "new";
  owner: string;
  repository: string;
  visibility: "public" | "private";
  branch: string;
}
export type GitHubSetupResult =
  | { ok: true; binding: GitHubPublishingBinding }
  | { ok: false; error: string; repositoryUrl?: string };
export type GitHubPublishResult =
  | { ok: true; binding: GitHubPublishingBinding; changed: boolean; deployment: "built" | "pending"; rebuilt?: boolean }
  | { ok: false; canceled?: boolean; error: string };

export interface WindowPreferences {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export interface NotesDesktopApi {
  assets?: {
    list(): Promise<{ ok: true; assets: import("./assets").Asset[] } | { ok: false; error: string }>;
    choose(imageOnly: boolean): Promise<{ ok: true; assets: import("./assets").Asset[] } | { ok: false; canceled?: boolean; error: string }>;
    import(name: string, base64: string, imageOnly: boolean): Promise<{ ok: true; asset: import("./assets").Asset } | { ok: false; canceled?: boolean; error: string }>;
    remove(ids: string[]): Promise<{ok:true;removed:boolean;workspace?:WorkspaceFile} | {ok:false;error:string}>;
    image(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>;
    saveCopy(id: string): Promise<OperationResult>;
    chooseBibliography(): Promise<{ok:true;source:BibliographySource}|{ok:false;canceled?:boolean;error:string}>;
  };
  loadWorkspace(): Promise<LoadWorkspaceResult>;
  saveWorkspace(workspace: WorkspaceFile): Promise<OperationResult>;
  exportBook(bookId: string): Promise<ExportBookResult>;
  validateBook(bookId: string): Promise<ValidateBookResult>;
  inspectBuildEnvironment(): Promise<BuildEnvironmentResult>;
  inspectEnvironment(): Promise<EnvironmentSetupResult>;
  installEnvironmentTool(id: EnvironmentToolId): Promise<EnvironmentInstallResult>;
  repairEnvironmentPermissions(): Promise<OperationResult>;
  cancelEnvironmentInstall(): Promise<OperationResult>;
  openEnvironmentInstructions(id: EnvironmentToolId): Promise<OperationResult>;
  openEnvironmentLog(): Promise<OperationResult>;
  onEnvironmentProgress(callback: (progress: EnvironmentInstallProgress) => void): () => void;
  buildBook(bookId: string, options?: { chooseLocation?: boolean }): Promise<BuildBookResult>;
  openBuildFolder(bookId: string): Promise<OperationResult>;
  openBookWebsite(bookId: string): Promise<OperationResult>;
  getBookWebsite(bookId: string): Promise<BookWebsiteResult>;
  startBookWebsite(bookId: string): Promise<BookWebsiteResult>;
  stopBookWebsite(bookId: string): Promise<BookWebsiteResult>;
  inspectGitHubPublishing(bookId: string): Promise<GitHubPublishingStatusResult>;
  setupGitHubPublishing(bookId: string, request: GitHubSetupRequest): Promise<GitHubSetupResult>;
  publishGitHubBook(bookId: string): Promise<GitHubPublishResult>;
  startGitHubSignIn(): Promise<OperationResult>;
  openGitHubCliDownload(): Promise<OperationResult>;
  openGitHubUrl(url: string): Promise<OperationResult>;
  getDataLocation(): Promise<DataLocationResult>;
  changeDataLocation(): Promise<DataLocationResult>;
  openDataLocation(): Promise<OperationResult>;
}
