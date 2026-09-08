import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnvironmentSetupPanel } from "../src/components/EnvironmentSetupPanel";
import type { NotesDesktopApi } from "../src/shared/types";

describe("EnvironmentSetupPanel", () => {
  it("shows locations and installs one missing tool independently", async () => {
    const inspect = vi.fn().mockResolvedValue({ ok: true, root: "D:\\LanCarbon", toolsPath: "D:\\LanCarbon\\Tools", logPath: "D:\\LanCarbon\\Config\\Logs\\environment-setup.log", items: [
      { id: "python", label: "Python", status: "error", detail: "Python was not found.", requirement: "Python 3.10 or newer", downloadSize: "about 28 MB", installable: true },
      { id: "github-network", label: "GitHub connection", status: "warning", detail: "GitHub could not be reached.", requirement: "HTTPS access", installable: false }
    ] });
    const install = vi.fn().mockResolvedValue({ ok: true, item: { id: "python", label: "Python", status: "pass", detail: "Python 3.13", requirement: "Python 3", installable: true } });
    window.notesDesktop = { inspectEnvironment: inspect, installEnvironmentTool: install, cancelEnvironmentInstall: vi.fn().mockResolvedValue({ ok: true }), openEnvironmentInstructions: vi.fn().mockResolvedValue({ ok: true }), openEnvironmentLog: vi.fn().mockResolvedValue({ ok: true }) } as unknown as NotesDesktopApi;
    const user = userEvent.setup(); render(<EnvironmentSetupPanel onClose={() => undefined} onNotice={() => undefined} />);
    expect(await screen.findByText("D:\\LanCarbon\\Tools")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(install).toHaveBeenCalledWith("python"));
    expect(screen.getByText(/local editing/i)).toBeInTheDocument();
  });
});
