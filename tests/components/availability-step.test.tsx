import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AvailabilityStep, createAvailabilityDraft, isAvailabilityDraftValid } from "../../app/components/setup/availability-step";
import { addCalendarDays } from "../../app/lib/planning/calendar";

afterEach(cleanup);

describe("AvailabilityStep", () => {
  function Harness({ planningDate = "2026-08-14", exceptions = [] }: { planningDate?: string; exceptions?: ReturnType<typeof createAvailabilityDraft>["exceptions"] }) {
    const [draft, setDraft] = useState(() => ({ ...createAvailabilityDraft("Asia/Shanghai"), exceptions }));
    return <><AvailabilityStep onChange={setDraft} planningDate={planningDate} value={draft} /><button disabled={!isAvailabilityDraftValid(draft, planningDate)} type="button">Continue</button></>;
  }

  it("starts with a weekly budget and discloses daily allocation without changing the total", async () => {
    const user = userEvent.setup(); render(<Harness />);
    expect(screen.getByRole("spinbutton", { name: "Available minutes per week" })).toHaveValue(420);
    expect(screen.queryByRole("spinbutton", { name: "Monday minutes" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Available minutes per week" }), { target: { value: "180" } });
    await user.click(screen.getByText("Daily schedule and time zone"));
    const daily = screen.getAllByRole("spinbutton", { name: /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) minutes$/ });
    expect(daily.reduce((sum, input) => sum + Number((input as HTMLInputElement).value), 0)).toBe(180);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("renders a seven-day ledger with a derived total and visible rest days", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Daily schedule and time zone"));

    expect(screen.getAllByRole("spinbutton", { name: / minutes$/ })).toHaveLength(7);
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Shanghai");
    expect(screen.getByText("420 minutes / week")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Monday minutes"));
    await user.type(screen.getByLabelText("Monday minutes"), "0");
    expect(screen.getByText("Monday · Rest")).toBeInTheDocument();
    expect(screen.getByText("360 minutes / week")).toBeInTheDocument();
  });

  it("validates exception minutes and enforces the 90-row limit without crashing", async () => {
    const user = userEvent.setup();
    const exceptions = Array.from({ length: 90 }, (_, index) => ({ date: addCalendarDays("2026-08-14", index), minutes: 0, reason: null }));
    const { rerender } = render(<Harness exceptions={exceptions} key="ninety" />);
    expect(screen.getByText("You can add up to 90 date overrides.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add date override" })).toBeDisabled();

    rerender(<Harness exceptions={[...exceptions, { date: addCalendarDays("2026-08-14", 90), minutes: 0, reason: null }]} key="ninety-one" />);
    expect(screen.getAllByRole("button", { name: /Remove date override/ })).toHaveLength(91);
    expect(screen.getByRole("button", { name: "Add date override" })).toBeDisabled();

    rerender(<Harness exceptions={[{ date: "2026-08-14", minutes: 0, reason: null }]} key="one" />);
    const minutes = screen.getByLabelText("Override minutes 1");
    await user.clear(minutes);
    await user.type(minutes, "720");
    expect(minutes).toHaveAttribute("aria-invalid", "false");
    expect(minutes).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/Enter 0 or a whole number from 15 to 720/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();

    await user.clear(minutes);
    await user.type(minutes, "721");
    expect(minutes).toHaveAttribute("aria-invalid", "true");
    expect(minutes).toHaveAttribute("aria-describedby", "exception-minutes-error-0");
    expect(screen.getByText(/Enter 0 or a whole number from 15 to 720/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("associates time, minute, duplicate, and horizon errors and previews exceptions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Daily schedule and time zone"));
    await user.click(screen.getByText("Date overrides (optional)"));

    await user.clear(screen.getByLabelText("Time zone"));
    await user.type(screen.getByLabelText("Time zone"), "Not/AZone");
    expect(screen.getByLabelText("Time zone")).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Add date override" }));
    expect(screen.getByText(/\(Friday\):/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add date override" }));
    expect(screen.getAllByText(/Date overrides must use different dates/)).toHaveLength(2);
    await user.clear(screen.getByLabelText("Override date 2"));
    await user.type(screen.getByLabelText("Override date 2"), "2027-08-16");
    expect(screen.getByText(/365 days/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove date override 2" }));
    expect(screen.queryByLabelText("Override date 2")).not.toBeInTheDocument();
  });

  it("contains malformed calendar dates and associates the date error", async () => {
    const user = userEvent.setup();
    const malformed = { ...createAvailabilityDraft("Asia/Shanghai"), exceptions: [{ date: "", minutes: 0, reason: null }] };
    expect(() => isAvailabilityDraftValid(malformed, "not-a-date")).not.toThrow();
    expect(isAvailabilityDraftValid(malformed, "not-a-date")).toBe(false);

    render(<Harness exceptions={malformed.exceptions} />);
    const date = screen.getByLabelText("Override date 1");
    await user.clear(date);
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAttribute("aria-describedby", "exception-date-error-0");
    expect(screen.getByText("Enter a valid date.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
