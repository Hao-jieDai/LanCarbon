import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetConflictDialog } from "../src/components/AssetConflictDialog";
import type { AssetConflictRequest } from "../src/shared/assets";
const request = { id: "request", existing: { size: 1024 }, incoming: { name: "图片.png", size: 2048 }, uses: [{ location: "Book A", title: "Page", line: 3 }] } as AssetConflictRequest;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function () {};
  HTMLDialogElement.prototype.close ??= function () {};
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});
describe("in-app duplicate resource dialog", () => {
  it("shows shared references and supports every explicit choice", async () => {
    for (const [name, choice] of [["Replace existing", "replace"], ["Keep both", "keep"], ["Cancel", "cancel"]]) {
      const onChoice = vi.fn().mockResolvedValue(undefined), view = render(<AssetConflictDialog request={request} onChoice={onChoice} />);
      expect(screen.getByRole("dialog")).toHaveTextContent("ALL 1 references"); expect(screen.getByRole("dialog")).toHaveTextContent("Book A / Page — line 3");
      fireEvent.click(screen.getByRole("button", { name })); await waitFor(() => expect(onChoice).toHaveBeenCalledWith(choice)); view.unmount();
    }
  });
  it("cancels on Escape and restores the previously focused editor when closed", async () => {
    const editor = document.createElement("textarea"); document.body.append(editor); editor.focus();
    const onChoice = vi.fn().mockResolvedValue(undefined), view = render(<AssetConflictDialog request={request} onChoice={onChoice} />);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true })); expect(onChoice).toHaveBeenCalledWith("cancel");
    view.unmount(); await waitFor(() => expect(editor).toHaveFocus()); editor.remove();
  });
  it("reports failed choices without closing or disabling a retry", async () => {
    const onChoice = vi.fn().mockRejectedValue(new Error("Resource is busy")); render(<AssetConflictDialog request={request} onChoice={onChoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep both" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Resource is busy"); expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});
