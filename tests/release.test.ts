// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_VERSION } from "../src/shared/notes";

describe("release metadata", () => {
  it("keeps the package and built-in ReadMe versions aligned", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { name: string; version: string; build: { appId: string; productName: string; nsis: { include: string } } };
    expect(packageJson.version).toBe(RELEASE_VERSION);
    const lock = JSON.parse(readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8"));
    expect(lock.version).toBe(RELEASE_VERSION);
    expect(lock.packages[""].version).toBe(RELEASE_VERSION);
    expect(packageJson.name).toBe("lancarbon");
    expect(packageJson.build.appId).toBe("cn.lancarbon.desktop");
    expect(packageJson.build.productName).toBe("LanCarbon");
    expect(packageJson.build.nsis.include).toBe("build/installer.nsh");
    const installer = readFileSync(path.join(process.cwd(), "build", "installer.nsh"), "utf8");
    for (const folder of ["Application", "Data", "Config", "Cache", "Temp", "Builds", "Exports"]) expect(installer).toContain(folder);
    expect(installer).toContain('StrCpy $INSTDIR "D:\\LanCarbon"');
  });

  it("packages the complete first-run tutorial without a personal publishing binding", () => {
    const starter = JSON.parse(readFileSync(path.join(process.cwd(), "resources", "starter-content", "notes.json"), "utf8"));
    const book = starter.books.find((item: { id: string }) => item.id === "lancarbon-from-zero-to-one");
    expect(book.settings.title).toBe("LanCarbon: From 0 to 1");
    expect(Object.keys(book.pages)).toHaveLength(37);
    expect(book.settings.publishing).toBeUndefined();
    const bookNoteIds = new Set(Object.values(book.pages).map((page: unknown) => (page as { noteId: string }).noteId));
    const content = starter.notes.filter((note: { id: string }) => bookNoteIds.has(note.id)).map((note: { content: string }) => note.content).join("\n");
    expect(content).not.toMatch(/^##\s*(English|中文)\s*$/imu);
    const home = starter.notes.find((note: { id: string }) => note.id === "tutorial-note-home");
    expect(home.content).toContain(":width: 50%\n:align: center");
    const assets = JSON.parse(readFileSync(path.join(process.cwd(), "resources", "starter-content", "assets.json"), "utf8"));
    expect(assets.assets).toHaveLength(8);
  });
});
