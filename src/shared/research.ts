export type WorkspaceMode = "notes" | "book" | "research" | "library";
export type ResearchPage = "run" | "templates" | "outputs" | "chat" | "settings";

export const RESEARCH_PAGES: Array<{ id: ResearchPage; label: string; description: string }> = [
  { id: "run", label: "Run", description: "Discover papers, expand your collection, and read selected materials." },
  { id: "templates", label: "Templates", description: "Choose the questions to investigate and the structure of your reading results." },
  { id: "outputs", label: "Outputs", description: "Review generated drafts and archive selected versions to Notes or Books." },
  { id: "chat", label: "Chat", description: "Discuss ideas and ask questions about selected source materials and drafts." },
  { id: "settings", label: "AI Settings", description: "Manage your AI connections and models for reading and conversation." }
];

export interface FoundationDirectories {
  library: string;
  libraryData: string;
  templates: string;
  outputs: string;
  records: string;
  chats: string;
}

// These records live outside Workspace v2 so older writing clients retain their data format.
export type EvidenceLocation =
  | { kind: "pdf"; page: number; text?: string }
  | { kind: "epub"; chapter: string; fragment?: string; text?: string }
  | { kind: "output"; outputId: string; version: number; paragraph: number };

export interface LibraryDocument {
  id: string;
  assetId?: string;
  relativePath: string;
  sha256: string;
  title: string;
  format: "pdf" | "epub" | "other";
  source: "import" | "research" | "existing-resource";
  doi?: string;
  createdAt: string;
}

export interface ResearchOutput {
  id: string;
  version: number;
  relativePath: string;
  sourceDocumentIds: string[];
  archiveTargets: Array<{ noteId: string; bookId?: string; pageId?: string; archivedVersion: number }>;
}
