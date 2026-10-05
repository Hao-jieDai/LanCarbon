// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { directoryList, resolveLanCarbonDirectories } from "../electron/app-directories";

describe("LanCarbon application directories", () => {
  it("derives every persistent folder from an installed Application folder", () => {
    const result = resolveLanCarbonDirectories({
      executable: "D:\\Writing\\LanCarbon\\Application\\LanCarbon.exe",
      packaged: true,
      platform: "win32",
      appData: "C:\\Users\\Writer\\AppData\\Roaming"
    });
    expect(result).toEqual({
      root: path.resolve("D:\\Writing\\LanCarbon"),
      application: path.resolve("D:\\Writing\\LanCarbon\\Application"),
      data: path.resolve("D:\\Writing\\LanCarbon\\Data"),
      config: path.resolve("D:\\Writing\\LanCarbon\\Config"),
      cache: path.resolve("D:\\Writing\\LanCarbon\\Cache"),
      temp: path.resolve("D:\\Writing\\LanCarbon\\Temp"),
      builds: path.resolve("D:\\Writing\\LanCarbon\\Builds"),
      exports: path.resolve("D:\\Writing\\LanCarbon\\Exports"),
      pdfs: path.resolve("D:\\Writing\\LanCarbon\\PDFs"),
      tools: path.resolve("D:\\Writing\\LanCarbon\\Tools")
    });
    expect(new Set(directoryList(result)).size).toBe(10);
  });

  it("uses the D drive root for Windows development and an explicit root when supplied", () => {
    expect(resolveLanCarbonDirectories({ executable: "node.exe", packaged: false, platform: "win32", appData: "C:\\Users\\Writer\\AppData\\Roaming", windowsDDriveAvailable: true }).root).toBe(path.resolve("D:\\LanCarbon"));
    expect(resolveLanCarbonDirectories({ executable: "node.exe", packaged: false, platform: "win32", appData: "C:\\Users\\Writer\\AppData\\Roaming", windowsDDriveAvailable: false }).root).toBe(path.resolve("C:\\Users\\Writer\\AppData\\Roaming\\LanCarbon"));
    expect(resolveLanCarbonDirectories({ executable: "node.exe", packaged: false, platform: "win32", appData: "C:\\Users\\Writer\\AppData\\Roaming", overrideRoot: "E:\\Apps\\LanCarbon" }).exports).toBe(path.resolve("E:\\Apps\\LanCarbon\\Exports"));
  });

  it("keeps test data isolated in the supplied E2E directory", () => {
    const result = resolveLanCarbonDirectories({ executable: "LanCarbon.exe", packaged: true, platform: "win32", appData: "C:\\AppData", e2eDirectory: "C:\\Temp\\lc-e2e" });
    expect(result.data).toBe(path.resolve("C:\\Temp\\lc-e2e"));
    expect(result.config).toBe(path.resolve("C:\\Temp\\lc-e2e"));
    expect(result.temp).toBe(path.resolve("C:\\Temp\\lc-e2e\\Temp"));
    expect(result.pdfs).toBe(path.resolve("C:\\Temp\\lc-e2e\\PDFs"));
  });
});
