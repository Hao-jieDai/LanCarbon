import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThemedSelect } from "../src/components/ThemedSelect";

describe("ThemedSelect", () => {
  it("navigates enabled options and closes on Escape without changing the value", async () => {
    const user = userEvent.setup(), change = vi.fn();
    render(<ThemedSelect label="Style" value="body" onChange={change} options={[
      { value: "mixed", label: "Mixed", disabled: true }, { value: "body", label: "Paragraph" }, { value: "h1", label: "Heading 1" }
    ]} />);
    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(change).toHaveBeenLastCalledWith("h1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{ArrowUp}{Home}{Escape}");
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters languages, accepts custom names and closes when another menu opens", async () => {
    const user = userEvent.setup();
    function Languages() {
      const [value, setValue] = useState("");
      return <><ThemedSelect editable label="Language" value={value} onChange={setValue} options={[
        { value: "python", label: "python" }, { value: "typescript", label: "typescript" }
      ]} /><ThemedSelect action label="Actions" value="" options={[{ value: "clear", label: "Clear" }]} onChange={() => {}} /></>;
    }
    render(<Languages />);
    const input = screen.getByRole("combobox");
    await user.type(input, "py");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("python");
    await user.clear(input); await user.type(input, "rust"); await user.keyboard("{Enter}");
    expect(input).toHaveValue("rust");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(input);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
