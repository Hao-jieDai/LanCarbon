import { promises as fs } from "node:fs";
import path from "node:path";
import type { FoundationDirectories } from "../src/shared/research";

export function researchDirectories(root: string, data: string): FoundationDirectories {
  return {
    library: path.join(root, "Library"),
    libraryData: path.join(data, "Library"),
    templates: path.join(data, "Research", "Templates"),
    outputs: path.join(data, "Research", "Outputs"),
    records: path.join(data, "Research", "Records"),
    chats: path.join(data, "Research", "Chats")
  };
}

export async function prepareResearchDirectories(root: string, data: string): Promise<FoundationDirectories> {
  const directories = researchDirectories(root, data);
  for (const directory of Object.values(directories)) await fs.mkdir(directory, { recursive: true });
  for (const name of ["Imports", "AI-Paper"]) await fs.mkdir(path.join(directories.library, name), { recursive: true });
  return directories;
}
