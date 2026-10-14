import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DatePicker, monthCells, validCalendarDate } from "../src/components/DatePicker";
function Field() { const [value, setValue] = useState("2024-02-29"); return <DatePicker label="Example date" value={value} onChange={setValue}/>; }
describe("themed calendar", () => {
  it("validates real dates and builds a Monday-first leap-month grid", () => {
    expect(validCalendarDate("2024-02-29")).toBe(true); expect(validCalendarDate("2025-02-29")).toBe(false); expect(validCalendarDate("2026-04-31")).toBe(false);
    const cells = monthCells("2024-02"); expect(cells).toHaveLength(42); expect(cells[0]).toBe("2024-01-29"); expect(cells).toContain("2024-02-29");
  });
  it("selects a calendar day and closes the popup", async () => {
    const user = userEvent.setup(); render(<Field/>); await user.click(screen.getByRole("button", { name: "Open Example date calendar" }));
    await user.click(screen.getByRole("gridcell", { name: "2024-02-16" })); expect(screen.getByLabelText("Example date")).toHaveValue("2024-02-16"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps invalid manual input from overwriting a valid date and supports clearing", async () => {
    const user = userEvent.setup(); render(<Field/>); fireEvent.change(screen.getByLabelText("Example date"), { target: { value: "2025-02-29" } }); fireEvent.blur(screen.getByLabelText("Example date")); expect(screen.getByLabelText("Example date")).toHaveValue("2024-02-29");
    await user.click(screen.getByRole("button", { name: "Open Example date calendar" })); await user.click(screen.getByRole("button", { name: "Clear" })); expect(screen.getByLabelText("Example date")).toHaveValue("");
  });
  it("navigates month and year choices inside the calendar and closes with Escape", async () => {
    const user = userEvent.setup(); render(<Field/>); await user.click(screen.getByRole("button", { name: "Open Example date calendar" }));
    await user.click(screen.getByRole("combobox", { name: "Example date month" })); await user.click(screen.getByRole("option", { name: "Mar" })); expect(screen.getByRole("gridcell", { name: "2024-03-16" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Example date year" })); await user.click(screen.getByRole("option", { name: "2025" })); expect(screen.getByRole("gridcell", { name: "2025-03-16" })).toBeInTheDocument();
    await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.getByLabelText("Example date")).toHaveValue("2024-02-29");
  });
});
