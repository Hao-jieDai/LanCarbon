import type { NotesDesktopApi } from "./shared/types";

declare global {
  interface Window {
    notesDesktop: NotesDesktopApi;
  }
}

export {};
