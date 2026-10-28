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
    return <><AvailabilityStep onChange={setDraft} planningDate={planningDate} value={draft} /><button disabled={!isAvailabilityDraftValid(draft, planningDate)} type="button">继续</button></>;
  }

  it("starts with a weekly budget and discloses daily allocation without changing the total", async () => {
    const user = userEvent.setup(); render(<Harness />);
    expect(screen.getByRole("spinbutton", { name: "每周可用分钟" })).toHaveValue(420);
    expect(screen.queryByRole("spinbutton", { name: "周一分钟数" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "每周可用分钟" }), { target: { value: "180" } });
    await user.click(screen.getByText("按天调整与时区"));
    const daily = screen.getAllByRole("spinbutton", { name: /周.分钟数$/ });
    expect(daily.reduce((sum, input) => sum + Number((input as HTMLInputElement).value), 0)).toBe(180);
    expect(screen.getByRole("button", { name: "继续" })).toBeEnabled();
  });

  it("renders a seven-day ledger with a derived total and visible rest days", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("按天调整与时区"));

    expect(screen.getAllByRole("spinbutton", { name: /分钟数$/ })).toHaveLength(7);
    expect(screen.getByLabelText("时区")).toHaveValue("Asia/Shanghai");
    expect(screen.getByText("420 分钟 / 周")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("周一分钟数"));
    await user.type(screen.getByLabelText("周一分钟数"), "0");
    expect(screen.getByText("周一 · 休息")).toBeInTheDocument();
    expect(screen.getByText("360 分钟 / 周")).toBeInTheDocument();
  });

  it("validates exception minutes and enforces the 90-row limit without crashing", async () => {
    const user = userEvent.setup();
    const exceptions = Array.from({ length: 90 }, (_, index) => ({ date: addCalendarDays("2026-08-14", index), minutes: 0, reason: null }));
    const { rerender } = render(<Harness exceptions={exceptions} key="ninety" />);
    expect(screen.getByText("最多可添加 90 项临时安排")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加临时安排" })).toBeDisabled();

    rerender(<Harness exceptions={[...exceptions, { date: addCalendarDays("2026-08-14", 90), minutes: 0, reason: null }]} key="ninety-one" />);
    expect(screen.getAllByRole("button", { name: /移除临时安排/ })).toHaveLength(91);
    expect(screen.getByRole("button", { name: "添加临时安排" })).toBeDisabled();

    rerender(<Harness exceptions={[{ date: "2026-08-14", minutes: 0, reason: null }]} key="one" />);
    const minutes = screen.getByLabelText("临时安排分钟数 1");
    await user.clear(minutes);
    await user.type(minutes, "720");
    expect(minutes).toHaveAttribute("aria-invalid", "false");
    expect(minutes).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/请输入 0 或 15 至 720 的整数/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeEnabled();

    await user.clear(minutes);
    await user.type(minutes, "721");
    expect(minutes).toHaveAttribute("aria-invalid", "true");
    expect(minutes).toHaveAttribute("aria-describedby", "exception-minutes-error-0");
    expect(screen.getByText(/请输入 0 或 15 至 720 的整数/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
  });

  it("associates time, minute, duplicate, and horizon errors and previews exceptions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("按天调整与时区"));
    await user.click(screen.getByText("临时安排（可选）"));

    await user.clear(screen.getByLabelText("时区"));
    await user.type(screen.getByLabelText("时区"), "Not/AZone");
    expect(screen.getByLabelText("时区")).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "添加临时安排" }));
    expect(screen.getByText(/（周五）调整为/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加临时安排" }));
    expect(screen.getAllByText(/临时安排的日期不能重复/)).toHaveLength(2);
    await user.clear(screen.getByLabelText("临时安排日期 2"));
    await user.type(screen.getByLabelText("临时安排日期 2"), "2027-08-16");
    expect(screen.getByText(/365 天/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "移除临时安排 2" }));
    expect(screen.queryByLabelText("临时安排日期 2")).not.toBeInTheDocument();
  });

  it("contains malformed calendar dates and associates the date error", async () => {
    const user = userEvent.setup();
    const malformed = { ...createAvailabilityDraft("Asia/Shanghai"), exceptions: [{ date: "", minutes: 0, reason: null }] };
    expect(() => isAvailabilityDraftValid(malformed, "not-a-date")).not.toThrow();
    expect(isAvailabilityDraftValid(malformed, "not-a-date")).toBe(false);

    render(<Harness exceptions={malformed.exceptions} />);
    const date = screen.getByLabelText("临时安排日期 1");
    await user.clear(date);
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAttribute("aria-describedby", "exception-date-error-0");
    expect(screen.getByText("请输入有效日期。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
  });
});
