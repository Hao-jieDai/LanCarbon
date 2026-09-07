// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GitHubPublishingService, type GitHubCommand } from "../electron/github-publishing";

function failure(text: string): never { throw Object.assign(new Error(text), { stderr: text }); }

describe("GitHub publishing setup", () => {
  it("reports Git, authentication, build, repository and Pages independently", async () => {
    const command: GitHubCommand = vi.fn(async (file, args) => {
      const value = `${file} ${args.join(" ")}`;
      if (value === "git --version") return { stdout: "git version 2.51.1" };
      if (value === "gh --version") return { stdout: "gh version 2.80.0\nextra" };
      if (value === "gh auth status") return { stdout: "Logged in" };
      if (value === "gh api user --jq .login") return { stdout: "haojie" };
      if (value.includes("repo view haojie/guide")) return { stdout: JSON.stringify({ nameWithOwner: "haojie/guide", url: "https://github.com/haojie/guide", visibility: "PUBLIC", defaultBranchRef: { name: "main" } }) };
      if (value === "git ls-remote --heads https://github.com/haojie/guide.git gh-pages") return { stdout: "0123456789012345678901234567890123456789\trefs/heads/gh-pages" };
      if (value === "gh api repos/haojie/guide/pages") return { stdout: JSON.stringify({ html_url: "https://haojie.github.io/guide/" }) };
      if (value === "gh api repos/haojie/guide/commits/gh-pages --jq .sha") return { stdout: "0123456789012345678901234567890123456789" };
      if (value === "gh api repos/haojie/guide/pages/builds/latest") return { stdout: JSON.stringify({ status: "built", commit: "0123456789012345678901234567890123456789" }) };
      return failure(`Unexpected command: ${value}`);
    });
    const service = new GitHubPublishingService(command);
    const result = await service.inspect({ repository: "haojie/guide", repositoryUrl: "https://github.com/haojie/guide", pagesUrl: "https://haojie.github.io/guide/", branch: "gh-pages", visibility: "PUBLIC", initializedAt: "2026-09-06T00:00:00.000Z", lastPublishedAt: "2026-09-06T01:00:00.000Z", lastCommit: "0123456789012345678901234567890123456789" }, "current");
    expect(result.account).toBe("haojie");
    expect(result.checks.map(check => [check.id, check.status])).toEqual([["git", "pass"], ["gh", "pass"], ["auth", "pass"], ["github-api", "pass"], ["build", "pass"], ["repository", "pass"], ["git-network", "pass"], ["pages", "pass"], ["publication", "pass"]]);
  });

  it("creates a new repository, publication branch and Pages source without a shell", async () => {
    const calls: string[] = [];
    const command: GitHubCommand = async (file, args) => {
      const value = `${file} ${args.join(" ")}`; calls.push(value);
      if (value === "gh auth status") return { stdout: "Logged in" };
      if (value.startsWith("gh repo create haojie/guide --public --add-readme")) return { stdout: "created" };
      if (value.startsWith("gh repo view haojie/guide")) return { stdout: JSON.stringify({ nameWithOwner: "haojie/guide", url: "https://github.com/haojie/guide", visibility: "PUBLIC", defaultBranchRef: { name: "main" } }) };
      if (value === "gh api repos/haojie/guide/git/ref/heads/gh-pages") return failure("not found");
      if (value === "gh api repos/haojie/guide/git/ref/heads/main --jq .object.sha") return { stdout: "0123456789012345678901234567890123456789" };
      if (value.startsWith("gh api --method POST repos/haojie/guide/git/refs")) return { stdout: "{}" };
      if (value === "gh api repos/haojie/guide/pages") return failure("not configured");
      if (value.startsWith("gh api --method POST repos/haojie/guide/pages")) return { stdout: JSON.stringify({ html_url: "https://haojie.github.io/guide/" }) };
      return failure(`Unexpected command: ${value}`);
    };
    const result = await new GitHubPublishingService(command).setup({ mode: "new", owner: "haojie", repository: "guide", visibility: "public", branch: "gh-pages" });
    expect(result).toMatchObject({ repository: "haojie/guide", branch: "gh-pages", pagesUrl: "https://haojie.github.io/guide/", visibility: "PUBLIC" });
    expect(calls.some(call => call.includes("--method POST repos/haojie/guide/git/refs"))).toBe(true);
    expect(calls.some(call => call.includes("source[branch]=gh-pages"))).toBe(true);
    expect(calls.every(call => !/[|;&]/.test(call))).toBe(true);
  });

  it("rejects unsafe owner, repository and branch names before invoking GitHub", async () => {
    const command: GitHubCommand = vi.fn(); const service = new GitHubPublishingService(command);
    await expect(service.setup({ mode: "existing", owner: "owner; calc", repository: "book", visibility: "public", branch: "gh-pages" })).rejects.toThrow("valid GitHub owner");
    await expect(service.setup({ mode: "existing", owner: "owner", repository: "../book", visibility: "public", branch: "gh-pages" })).rejects.toThrow("valid GitHub repository");
    await expect(service.setup({ mode: "existing", owner: "owner", repository: "book", visibility: "public", branch: "bad/branch" })).rejects.toThrow("publication branch");
    expect(command).not.toHaveBeenCalled();
  });

  it("recovers when a new repository temporarily returns 404 while Pages is being initialized", async () => {
    let pagesChecks = 0, configureAttempts = 0;
    const command: GitHubCommand = async (file, args) => {
      const value = `${file} ${args.join(" ")}`;
      if (value === "gh auth status") return { stdout: "Logged in" };
      if (value.startsWith("gh repo create haojie/guide --public --add-readme")) return { stdout: "created" };
      if (value.startsWith("gh repo view haojie/guide")) return { stdout: JSON.stringify({ nameWithOwner: "haojie/guide", url: "https://github.com/haojie/guide", visibility: "PUBLIC", defaultBranchRef: { name: "main" } }) };
      if (value === "gh api repos/haojie/guide/git/ref/heads/gh-pages") return { stdout: "{}" };
      if (value === "gh api repos/haojie/guide/pages") {
        pagesChecks += 1;
        if (pagesChecks === 1) return failure("Not Found (HTTP 404)");
        return { stdout: JSON.stringify({ html_url: "https://haojie.github.io/guide/", source: { branch: "gh-pages" } }) };
      }
      if (value.startsWith("gh api --method POST repos/haojie/guide/pages")) { configureAttempts += 1; return failure("Not Found (HTTP 404)"); }
      return failure(`Unexpected command: ${value}`);
    };
    const pause = vi.fn().mockResolvedValue(undefined);
    const result = await new GitHubPublishingService(command, pause).setup({ mode: "new", owner: "haojie", repository: "guide", visibility: "public", branch: "gh-pages" });
    expect(result.pagesUrl).toBe("https://haojie.github.io/guide/");
    expect(configureAttempts).toBe(1);
    expect(pause).toHaveBeenCalledWith(600);
  });

  it("replaces the publication branch website with the completed build and pushes one verified commit", async () => {
    const html = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-html-test-"));
    const publicationTemp = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-publication-temp-test-"));
    await fs.writeFile(path.join(html, "index.html"), "<h1>Current Book</h1>");
    const calls: string[] = [];
    const command: GitHubCommand = async (file, args, options) => {
      const value = `${file} ${args.join(" ")}`; calls.push(value);
      if (value === "gh auth status" || value === "gh auth setup-git") return { stdout: "ok" };
      if (value.startsWith("gh repo view haojie/guide")) return { stdout: "{}" };
      if (value.startsWith("gh repo clone haojie/guide ")) { expect(args[3].startsWith(publicationTemp)).toBe(true); await fs.mkdir(path.join(args[3], ".git")); await fs.writeFile(path.join(args[3], "old.html"), "old"); return { stdout: "cloned" }; }
      if (value === "git add --all" || value.startsWith("git config ") || value.startsWith("git commit ") || value === "git push origin HEAD:gh-pages") return { stdout: "ok" };
      if (value === "git status --porcelain") return { stdout: " M index.html" };
      if (value === "git rev-parse HEAD") return { stdout: "abcdef0123456789abcdef0123456789abcdef01" };
      if (value === "gh api repos/haojie/guide/pages/builds/latest") return { stdout: JSON.stringify({ status: "built", commit: "abcdef0123456789abcdef0123456789abcdef01" }) };
      return failure(`Unexpected command: ${value} (${options?.cwd})`);
    };
    try {
      const binding = { repository: "haojie/guide", repositoryUrl: "https://github.com/haojie/guide", pagesUrl: "https://haojie.github.io/guide/", branch: "gh-pages", visibility: "PUBLIC" as const, initializedAt: "2026-09-06T00:00:00.000Z" };
      const result = await new GitHubPublishingService(command, undefined, publicationTemp).publish(binding, html, "Guide");
      expect(result.changed).toBe(true);
      expect(result.binding.lastCommit).toBe("abcdef0123456789abcdef0123456789abcdef01");
      expect(result.deployment).toBe("built");
      expect(calls).toContain("git push origin HEAD:gh-pages");
      expect(calls.some(call => call.includes("--single-branch --depth=1"))).toBe(true);
    } finally { await fs.rm(html, { recursive: true, force: true }); await fs.rm(publicationTemp, { recursive: true, force: true }); }
  });

  it("actively deploys the uploaded revision when Pages is still serving the repository's initial commit", async () => {
    const html = await fs.mkdtemp(path.join(os.tmpdir(), "lancarbon-html-race-test-"));
    await fs.writeFile(path.join(html, "index.html"), "<h1>Example Book</h1>");
    const revision = "abcdef0123456789abcdef0123456789abcdef01";
    let deploymentChecks = 0, cloneAttempts = 0;
    const calls: string[] = [];
    const command: GitHubCommand = async (file, args) => {
      const value = `${file} ${args.join(" ")}`; calls.push(value);
      if (value === "gh auth status" || value === "gh auth setup-git") return { stdout: "ok" };
      if (value.startsWith("gh repo view haojie/example")) return { stdout: "{}" };
      if (value.startsWith("gh repo clone haojie/example ")) {
        cloneAttempts += 1;
        if (cloneAttempts === 1) return failure("Recv failure: Connection was reset");
        await fs.mkdir(path.join(args[3], ".git")); return { stdout: "cloned" };
      }
      if (value === "git add --all" || value.startsWith("git config ") || value.startsWith("git commit ") || value === "git push origin HEAD:gh-pages") return { stdout: "ok" };
      if (value === "git status --porcelain") return { stdout: " M index.html" };
      if (value === "git rev-parse HEAD") return { stdout: revision };
      if (value === "gh api repos/haojie/example/pages/builds/latest") {
        deploymentChecks += 1;
        if (deploymentChecks === 1) return { stdout: JSON.stringify({ status: "built", commit: "1111111111111111111111111111111111111111" }) };
        if (deploymentChecks === 2) return { stdout: JSON.stringify({ status: "building", commit: revision }) };
        return { stdout: JSON.stringify({ status: "built", commit: revision }) };
      }
      if (value === "gh api --method POST repos/haojie/example/pages/builds") return { stdout: JSON.stringify({ status: "queued" }) };
      return failure(`Unexpected command: ${value}`);
    };
    const pause = vi.fn().mockResolvedValue(undefined);
    try {
      const binding = { repository: "haojie/example", repositoryUrl: "https://github.com/haojie/example", pagesUrl: "https://haojie.github.io/example/", branch: "gh-pages", visibility: "PUBLIC" as const, initializedAt: "2026-09-06T00:00:00.000Z" };
      const result = await new GitHubPublishingService(command, pause).publish(binding, html, "Example Book");
      expect(result.deployment).toBe("built");
      expect(cloneAttempts).toBe(2);
      expect(calls).toContain("gh api --method POST repos/haojie/example/pages/builds");
      expect(pause).toHaveBeenCalledWith(800);
      expect(pause).toHaveBeenCalledWith(2_500);
    } finally { await fs.rm(html, { recursive: true, force: true }); }
  });
});
