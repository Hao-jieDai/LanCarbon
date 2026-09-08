// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { environmentWithManagedTools } from "../electron/environment-manager";

describe("managed tool environment", () => {
  it("prepends LanCarbon tools without changing the system configuration", () => {
    const root = path.resolve("D:\\LanCarbon\\Tools");
    const result = environmentWithManagedTools(root, { Path: "C:\\Windows\\System32" });
    const entries = String(result.Path).split(path.delimiter);
    expect(entries[0]).toBe(path.join(root, "JupyterBook", "Scripts"));
    expect(entries).toContain(path.join(root, "Python"));
    expect(entries).toContain(path.join(root, "Git", "cmd"));
    expect(entries).toContain(path.join(root, "GitHubCLI", "bin"));
    expect(entries.at(-1)).toBe("C:\\Windows\\System32");
    expect(result.PATH).toBe(result.Path);
  });
});
