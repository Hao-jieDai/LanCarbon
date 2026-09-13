import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnvironmentSetupPanel } from "../src/components/EnvironmentSetupPanel";
import type { NotesDesktopApi } from "../src/shared/types";

describe("EnvironmentSetupPanel", () => {
  it("never offers installation for a compatible system tool", async () => {
    window.notesDesktop = { inspectEnvironment: vi.fn().mockResolvedValue({ ok: true, root: "D:\\LanCarbon", toolsPath: "D:\\LanCarbon\\Tools", logPath: "log", items: [
      { id: "python", label: "Python", status: "pass", detail: "Python 3.13.14 · System installation — no additional install needed", path: "D:\\python313\\python.exe", source: "system", requirement: "Python 3.10 or newer", installable: false }
    ] }), installEnvironmentTool: vi.fn(), cancelEnvironmentInstall: vi.fn().mockResolvedValue({ ok: true }), openEnvironmentInstructions: vi.fn(), openEnvironmentLog: vi.fn(), onEnvironmentProgress: vi.fn().mockReturnValue(() => undefined) } as unknown as NotesDesktopApi;
    render(<EnvironmentSetupPanel onClose={() => undefined} onNotice={() => undefined} />);
    expect(await screen.findByText("Using existing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /install/i })).not.toBeInTheDocument();
  });

  it("shows live download progress and makes cancellation visible", async () => {
    const inspect = vi.fn().mockResolvedValue({ ok: true, root: "D:\\LanCarbon", toolsPath: "D:\\LanCarbon\\Tools", logPath: "D:\\LanCarbon\\Config\\Logs\\environment-setup.log", items: [
      { id: "python", label: "Python", status: "error", detail: "Python was not found.", requirement: "Python 3.10 or newer", downloadSize: "about 11 MB", installable: true },
      { id: "github-network", label: "GitHub connection", status: "warning", detail: "GitHub could not be reached.", requirement: "HTTPS access", installable: false }
    ] });
    let finish!: (value: unknown) => void;
    const install = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const cancel = vi.fn().mockResolvedValue({ ok: true });
    let progress!: (value: { tool: "python"; phase: "downloading"; message: string; receivedBytes: number; totalBytes: number }) => void;
    window.notesDesktop = { inspectEnvironment: inspect, installEnvironmentTool: install, cancelEnvironmentInstall: cancel, openEnvironmentInstructions: vi.fn().mockResolvedValue({ ok: true }), openEnvironmentLog: vi.fn().mockResolvedValue({ ok: true }), onEnvironmentProgress: vi.fn(callback => { progress = callback as typeof progress; return () => undefined; }) } as unknown as NotesDesktopApi;
    const user = userEvent.setup(); render(<EnvironmentSetupPanel onClose={() => undefined} onNotice={() => undefined} />);
    expect(await screen.findByText("D:\\LanCarbon\\Tools")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install managed copy" }));
    await waitFor(() => expect(install).toHaveBeenCalledWith("python"));
    act(() => progress({ tool: "python", phase: "downloading", message: "Downloading portable Python…", receivedBytes: 5 * 1024 * 1024, totalBytes: 10 * 1024 * 1024 }));
    expect(screen.getByText("Downloading portable Python…")).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Canceling…" })).toBeDisabled();
    await act(async () => { finish({ ok: false, canceled: true, error: "Installation canceled" }); });
    expect(screen.getByText(/local editing/i)).toBeInTheDocument();
  });

  it("repairs a blocked managed Tools folder from the failed card", async () => {
    const inspect = vi.fn()
      .mockResolvedValueOnce({ ok: true, root: "D:\\LanCarbon", toolsPath: "D:\\LanCarbon\\Tools", logPath: "log", items: [
        { id: "tools-permission", label: "Managed tools folder", status: "error", detail: "Access is denied.", requirement: "Writable LanCarbon\\Tools folder", installable: false, repairable: true }
      ] })
      .mockResolvedValue({ ok: true, root: "D:\\LanCarbon", toolsPath: "D:\\LanCarbon\\Tools", logPath: "log", items: [
        { id: "tools-permission", label: "Managed tools folder", status: "pass", detail: "D:\\LanCarbon\\Tools is writable.", requirement: "Writable LanCarbon\\Tools folder", installable: false }
      ] });
    const repair = vi.fn().mockResolvedValue({ ok: true });
    window.notesDesktop = { inspectEnvironment: inspect, installEnvironmentTool: vi.fn(), repairEnvironmentPermissions: repair, cancelEnvironmentInstall: vi.fn().mockResolvedValue({ ok: true }), openEnvironmentInstructions: vi.fn(), openEnvironmentLog: vi.fn(), onEnvironmentProgress: vi.fn().mockReturnValue(() => undefined) } as unknown as NotesDesktopApi;
    const notice = vi.fn();
    const user = userEvent.setup();
    render(<EnvironmentSetupPanel onClose={() => undefined} onNotice={notice} />);
    await user.click(await screen.findByRole("button", { name: "Repair folder permissions" }));
    expect(repair).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText("D:\\LanCarbon\\Tools is writable.")).toBeInTheDocument());
    expect(notice).toHaveBeenCalledWith("Managed tools folder permissions repaired");
  });
});
