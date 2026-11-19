import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningLoadBoundary } from "../../app/components/workspace/planning-version-boundary";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("quiet planning transitions", () => {
  it("does not announce a brief read or render a page-sized loading heading", () => {
    vi.useFakeTimers();
    const page = render(<PlanningLoadBoundary loading onRetry={vi.fn()} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(299));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    page.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("offers one concise status only when the read takes longer", () => {
    vi.useFakeTimers();
    render(<PlanningLoadBoundary loading onRetry={vi.fn()} />);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("status")).toHaveTextContent("Loading your learning content…");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a real failure immediately and cancels the pending announcement", () => {
    vi.useFakeTimers();
    const page = render(<PlanningLoadBoundary loading onRetry={vi.fn()} />);
    page.rerender(<PlanningLoadBoundary loading={false} onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your saved plan could not be confirmed");
    expect(screen.getByRole("button", { name: "Reload plan" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps retry usable after a failed retry", async () => {
    const retry = vi.fn().mockRejectedValue(new Error("offline"));
    render(<PlanningLoadBoundary loading={false} onRetry={retry} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reload plan" })); });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reload plan" })).toBeEnabled();
  });
});
