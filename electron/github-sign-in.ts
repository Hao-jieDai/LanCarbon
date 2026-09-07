import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OperationResult } from "../src/shared/types";

const execute = promisify(execFile);
export type SignInLauncher = (file: string, args: string[]) => Promise<unknown>;

const defaultLauncher: SignInLauncher = (file, args) => execute(file, args, {
  windowsHide: true,
  timeout: 10_000,
  maxBuffer: 256 * 1024
});

export async function startGitHubSignIn(
  platform = process.platform,
  launch: SignInLauncher = defaultLauncher
): Promise<OperationResult> {
  if (platform !== "win32") return { ok: false, error: "Interactive GitHub sign-in is currently available in the Windows build." };
  const loginCommand = [
    "Write-Host 'LanCarbon GitHub sign-in'",
    "Write-Host 'Complete the browser authorization, then return to LanCarbon and select Refresh Checks.'",
    "gh auth login --hostname github.com --git-protocol https --web"
  ].join("; ");
  const escaped = loginCommand.replace(/'/g, "''");
  const launcher = `$command = '${escaped}'; Start-Process -FilePath 'powershell.exe' -WindowStyle Normal -ArgumentList @('-NoExit','-NoProfile','-Command',$command)`;
  try {
    await launch("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", launcher]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to open the GitHub sign-in window" };
  }
}
