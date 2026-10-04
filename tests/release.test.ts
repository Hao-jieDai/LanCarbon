// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_VERSION } from "../src/shared/notes";

describe("release metadata", () => {
  it("documents sorting, folding and Ctrl+Q bilingually without version history in the tutorial", () => {
    const starter = JSON.parse(readFileSync(path.join(process.cwd(), "resources", "starter-content", "notes.json"), "utf8"));
    const tour = starter.notes.find((note: { id: string }) => note.id === "tutorial-note-s1-interface").content;
    for (const phrase of ["**Notes / Books**", "**Ctrl+Q**", "**Last modified**", "**Date created**", "**Name (A–Z)**"]) {
      expect(tour.split(phrase)).toHaveLength(3);
      expect(readFileSync(path.join(process.cwd(), "README.md"), "utf8")).toContain(phrase);
    }
    expect(tour).toContain("Each Book remembers its folded branches across restarts");
    expect(tour).toContain("每本 Book 分别记住折叠状态");
    const content = starter.notes.map((note: { content: string }) => note.content).join("\n");
    expect(content).not.toMatch(/\*\*(?:Notes \/ )?Jupyter Book\*\*/u);
    expect(content).not.toContain(`LanCarbon ${RELEASE_VERSION}`);
  });

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
    for (const folder of ["Application", "Data", "Config", "Cache", "Temp", "Builds", "Exports", "Tools"]) expect(installer).toContain(folder);
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
    for (const asset of assets.assets) {
      const file = asset.file ?? asset.id;
      const bytes = readFileSync(path.join(process.cwd(), "resources", "starter-content", "assets", file));
      expect(bytes.length).toBe(asset.size);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(path.parse(file).name);
    }
    const logo = assets.assets.find((asset: { id: string }) => asset.id === "8405f88769f513467cc1aa25973fa97e6ad60427ff943279ab2d299a3d70ca75.png");
    expect(logo.file).toBe("467222c73878df59bdeebc7e74c0aebc63d96432aff2264fa24635a625ee0231.png");
    const mainWorkspace = assets.assets.find((asset: { id: string }) => asset.id === "2de495e4aed7eca98ea1cfbe93ff676026cc958d049bcddb5065b40f0e00e4d9.png");
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    expect(readme).toContain('<img src="build/icon.png" alt="LanCarbon"');
    expect(readme).toContain(`resources/starter-content/assets/${mainWorkspace.file}`);
    expect(readFileSync(path.join(process.cwd(), "public", "icon.png"))).toEqual(readFileSync(path.join(process.cwd(), "build", "icon.png")));
    const ico = readFileSync(path.join(process.cwd(), "build", "icon.ico"));
    expect(ico.readUInt16LE(4)).toBe(7);
    expect(Array.from({ length: 7 }, (_, index) => ico[6 + index * 16] || 256)).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});
