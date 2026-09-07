import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GitHubPublishingPanel } from "../src/components/GitHubPublishingPanel";
import { createBook } from "../src/shared/books";
import type { GitHubCheck, GitHubPublishingBinding, NotesDesktopApi } from "../src/shared/types";

const ready: GitHubCheck[] = [
  { id: "git", label: "Git", status: "pass", detail: "git version 2" },
  { id: "gh", label: "GitHub CLI", status: "pass", detail: "gh version 2" },
  { id: "auth", label: "GitHub account", status: "pass", detail: "Signed in as haojie." },
  { id: "github-api", label: "GitHub API", status: "pass", detail: "Reachable." },
  { id: "build", label: "Book website build", status: "warning", detail: "Build later." },
  { id: "repository", label: "Repository binding", status: "warning", detail: "Not connected." },
  { id: "git-network", label: "Git HTTPS connection", status: "warning", detail: "Connect first." },
  { id: "pages", label: "GitHub Pages", status: "warning", detail: "Not configured." }
];

describe("GitHubPublishingPanel", () => {
  it("uses the authenticated owner and saves a verified new repository binding", async () => {
    const user = userEvent.setup(), binding: GitHubPublishingBinding = { repository: "haojie/guide", repositoryUrl: "https://github.com/haojie/guide", pagesUrl: "https://haojie.github.io/guide/", branch: "gh-pages", visibility: "PUBLIC", initializedAt: "2026-09-06T00:00:00.000Z" };
    const inspect = vi.fn().mockResolvedValue({ ok: true, checks: ready, account: "haojie" });
    const setup = vi.fn().mockResolvedValue({ ok: true, binding });
    window.notesDesktop = { inspectGitHubPublishing: inspect, setupGitHubPublishing: setup, openGitHubUrl: vi.fn().mockResolvedValue({ ok: true }), openGitHubCliDownload: vi.fn().mockResolvedValue({ ok: true }), startGitHubSignIn: vi.fn().mockResolvedValue({ ok: true }) } as unknown as NotesDesktopApi;
    const { book } = createBook("LanCarbon Guide"); const onBinding = vi.fn();
    render(<GitHubPublishingPanel book={book} onBinding={onBinding} onClose={() => undefined} onNotice={() => undefined} />);
    await waitFor(() => expect(screen.getByLabelText("GitHub owner")).toHaveValue("haojie"));
    await user.click(screen.getByRole("button", { name: "New repository" }));
    await user.click(screen.getByRole("button", { name: "Create Repository and Pages" }));
    await waitFor(() => expect(setup).toHaveBeenCalledWith(book.id, expect.objectContaining({ mode: "new", owner: "haojie", repository: "LanCarbon-Guide", branch: "gh-pages" })));
    expect(onBinding).toHaveBeenCalledWith(binding);
  });

  it("offers the official CLI download when GitHub CLI is missing", async () => {
    const open = vi.fn().mockResolvedValue({ ok: true });
    window.notesDesktop = { inspectGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, checks: ready.map(check => check.id === "gh" || check.id === "auth" ? { ...check, status: "error" } : check) }), setupGitHubPublishing: vi.fn(), openGitHubUrl: vi.fn(), openGitHubCliDownload: open, startGitHubSignIn: vi.fn() } as unknown as NotesDesktopApi;
    const { book } = createBook("Book"); render(<GitHubPublishingPanel book={book} onBinding={() => undefined} onClose={() => undefined} onNotice={() => undefined} />);
    const button = await screen.findByRole("button", { name: "Open GitHub CLI Download" }); await userEvent.click(button); expect(open).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Connect and Initialize Pages" })).toBeDisabled();
  });

  it("shows an in-panel instruction after opening the interactive sign-in window", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true });
    window.notesDesktop = { inspectGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, checks: ready.map(check => check.id === "auth" ? { ...check, status: "error" } : check) }), setupGitHubPublishing: vi.fn(), openGitHubUrl: vi.fn(), openGitHubCliDownload: vi.fn(), startGitHubSignIn: signIn } as unknown as NotesDesktopApi;
    const { book } = createBook("Book"); render(<GitHubPublishingPanel book={book} onBinding={() => undefined} onClose={() => undefined} onNotice={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign in with GitHub CLI" }));
    expect(signIn).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("PowerShell sign-in window has opened");
  });

  it("publishes a connected successful build and records the verified revision", async () => {
    const user = userEvent.setup();
    const binding: GitHubPublishingBinding = { repository: "haojie/guide", repositoryUrl: "https://github.com/haojie/guide", pagesUrl: "https://haojie.github.io/guide/", branch: "gh-pages", visibility: "PUBLIC", initializedAt: "2026-09-06T00:00:00.000Z" };
    const published = { ...binding, lastPublishedAt: "2026-09-06T02:00:00.000Z", lastCommit: "abcdef0123456789abcdef0123456789abcdef01" };
    const checks: GitHubCheck[] = ready.map(check => ({ ...check, status: "pass" }));
    checks.push({ id: "publication", label: "Published website", status: "warning", detail: "Ready." });
    const publish = vi.fn().mockResolvedValue({ ok: true, binding: published, changed: true, deployment: "built" }); const onBinding = vi.fn();
    window.notesDesktop = { inspectGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, checks, account: "haojie", buildStatus: "current" }), publishGitHubBook: publish, setupGitHubPublishing: vi.fn(), openGitHubUrl: vi.fn(), openGitHubCliDownload: vi.fn(), startGitHubSignIn: vi.fn() } as unknown as NotesDesktopApi;
    const { book } = createBook("Guide"); book.settings.publishing = binding;
    render(<GitHubPublishingPanel book={book} onBinding={onBinding} onClose={() => undefined} onNotice={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: "Publish Website" }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(book.id));
    expect(onBinding).toHaveBeenCalledWith(published);
    expect(screen.getByText(/commit abcdef0/)).toBeInTheDocument();
  });

  it("allows an update retry after the separate Git HTTPS check was reset", async () => {
    const binding: GitHubPublishingBinding = { repository: "haojie/example", repositoryUrl: "https://github.com/haojie/example", pagesUrl: "https://haojie.github.io/example/", branch: "gh-pages", visibility: "PUBLIC", initializedAt: "2026-09-06T00:00:00.000Z", lastPublishedAt: "2026-09-06T02:00:00.000Z", lastCommit: "abcdef0123456789abcdef0123456789abcdef01" };
    const checks: GitHubCheck[] = ready.map(check => ({ ...check, status: check.id === "git-network" ? "warning" : "pass" }));
    window.notesDesktop = { inspectGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, checks, account: "haojie", buildStatus: "current" }), publishGitHubBook: vi.fn(), setupGitHubPublishing: vi.fn(), openGitHubUrl: vi.fn(), openGitHubCliDownload: vi.fn(), startGitHubSignIn: vi.fn() } as unknown as NotesDesktopApi;
    const { book } = createBook("Example"); book.settings.publishing = binding;
    render(<GitHubPublishingPanel book={book} onBinding={() => undefined} onClose={() => undefined} onNotice={() => undefined} />);
    expect(await screen.findByRole("button", { name: "Update Website" })).toBeEnabled();
  });

  it("offers one action to rebuild and update a changed Book", async () => {
    const binding: GitHubPublishingBinding = { repository: "haojie/example", repositoryUrl: "https://github.com/haojie/example", pagesUrl: "https://haojie.github.io/example/", branch: "gh-pages", visibility: "PUBLIC", initializedAt: "2026-09-06T00:00:00.000Z", lastPublishedAt: "2026-09-06T02:00:00.000Z", lastCommit: "abcdef0123456789abcdef0123456789abcdef01" };
    const checks: GitHubCheck[] = ready.map(check => ({ ...check, status: check.id === "build" ? "warning" : "pass" }));
    const publish = vi.fn().mockResolvedValue({ ok: true, binding: { ...binding, lastPublishedAt: "2026-09-07T02:00:00.000Z" }, changed: true, deployment: "built", rebuilt: true });
    window.notesDesktop = { inspectGitHubPublishing: vi.fn().mockResolvedValue({ ok: true, checks, account: "haojie", buildStatus: "outdated" }), publishGitHubBook: publish, setupGitHubPublishing: vi.fn(), openGitHubUrl: vi.fn(), openGitHubCliDownload: vi.fn(), startGitHubSignIn: vi.fn() } as unknown as NotesDesktopApi;
    const { book } = createBook("Example"); book.settings.publishing = binding;
    render(<GitHubPublishingPanel book={book} onBinding={() => undefined} onClose={() => undefined} onNotice={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: "Rebuild and Update Website" }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(book.id));
    expect(screen.getByText("The managed website matches the current Book.")).toBeInTheDocument();
  });
});
