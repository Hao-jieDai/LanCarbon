// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { startGitHubSignIn } from "../electron/github-sign-in";

describe("GitHub interactive sign-in", () => {
  it("opens a visible interactive PowerShell window on Windows", async () => {
    const launch = vi.fn().mockResolvedValue(undefined);
    await expect(startGitHubSignIn("win32", launch)).resolves.toEqual({ ok: true });
    expect(launch).toHaveBeenCalledWith("powershell.exe", expect.arrayContaining(["-WindowStyle", "Hidden", "-Command"]));
    const command = launch.mock.calls[0][1].at(-1) as string;
    expect(command).toContain("Start-Process -FilePath 'powershell.exe' -WindowStyle Normal");
    expect(command).toContain("gh auth login --hostname github.com --git-protocol https --web");
  });

  it("reports launcher failures and unsupported platforms", async () => {
    await expect(startGitHubSignIn("win32", vi.fn().mockRejectedValue(new Error("blocked")))).resolves.toEqual({ ok: false, error: "blocked" });
    await expect(startGitHubSignIn("linux", vi.fn())).resolves.toMatchObject({ ok: false });
  });
});
