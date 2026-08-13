import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AvailabilityStep, createAvailabilityDraft } from "../../app/components/setup/availability-step";

afterEach(cleanup);

describe("AvailabilityStep", () => {
  function Harness({ planningDate = "2026-08-14" }: { planningDate?: string }) {
    const [draft, setDraft] = useState(() => createAvailabilityDraft("Asia/Shanghai"));
    return <AvailabilityStep onChange={setDraft} planningDate={planningDate} value={draft} />;
  }

  it("renders a seven-day ledger with a derived total and visible rest days", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByRole("spinbutton", { name: /minutes$/i })).toHaveLength(7);
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Shanghai");
    expect(screen.getByText("420 minutes / week")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Monday minutes"));
    await user.type(screen.getByLabelText("Monday minutes"), "0");
    expect(screen.getByText("Monday · Rest")).toBeInTheDocument();
    expect(screen.getByText("360 minutes / week")).toBeInTheDocument();
  });

  it("associates time, minute, duplicate, and horizon errors and previews exceptions", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(screen.getByLabelText("Time zone"));
    await user.type(screen.getByLabelText("Time zone"), "Not/AZone");
    expect(screen.getByLabelText("Time zone")).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Add date exception" }));
    expect(screen.getByText(/overrides Friday/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add date exception" }));
    expect(screen.getByText(/Exception dates must be unique/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Exception date 2"));
    await user.type(screen.getByLabelText("Exception date 2"), "2027-08-16");
    expect(screen.getByText(/365 days/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove exception 2" }));
    expect(screen.queryByLabelText("Exception date 2")).not.toBeInTheDocument();
  });
});
