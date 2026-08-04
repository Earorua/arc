import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MigrationBanner } from "../../app/components/sync/migration-banner";
import { ArcApiError } from "../../app/lib/cloud-client";
import {
  completeDemoUnit,
  createDemoState,
  mergeSetup,
  saveDemoState,
} from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("MigrationBanner", () => {
  it("summarizes meaningful local work and imports only after an explicit click", async () => {
    const user = userEvent.setup();
    const state = completeDemoUnit(createDemoState(), flagshipRole.today);
    const onImport = vi.fn().mockResolvedValue(undefined);

    render(<MigrationBanner state={state} status="available" onDismiss={vi.fn()} onImport={onImport} />);

    expect(screen.getByText(/1 completed unit/)).toBeInTheDocument();
    expect(screen.getByText(/1 proof/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Import to Arc." }));
    expect(onImport).toHaveBeenCalledWith("reject");
  });

  it("dismisses without deleting the local bytes", async () => {
    const user = userEvent.setup();
    const state = completeDemoUnit(createDemoState(), flagshipRole.today);
    saveDemoState(state);
    const before = window.localStorage.getItem("arc-demo-state-v1");

    render(<MigrationBanner state={state} status="available" onDismiss={vi.fn()} onImport={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.queryByRole("button", { name: "Import to Arc." })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("arc-demo-state-v1")).toBe(before);
  });

  it("offers both explicit conflict resolutions without choosing one automatically", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn()
      .mockRejectedValueOnce(new ArcApiError(409, "CONFLICT", "Cloud goal exists", "request-1"))
      .mockResolvedValue(undefined);
    render(
      <MigrationBanner
        onDismiss={vi.fn()}
        onImport={onImport}
        state={completeDemoUnit(createDemoState(), flagshipRole.today)}
        status="available"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import to Arc." }));

    const keepCloud = await screen.findByRole("button", { name: "Keep cloud goal; archive import" });
    const activateImport = screen.getByRole("button", { name: "Archive cloud goal; activate import" });
    expect(onImport).toHaveBeenCalledTimes(1);

    await user.click(keepCloud);
    expect(onImport).toHaveBeenLastCalledWith("archive-import");
    expect(activateImport).toBeInTheDocument();
  });

  it("keeps failed synchronization retryable", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(
      <MigrationBanner
        onDismiss={vi.fn()}
        onImport={onImport}
        state={completeDemoUnit(createDemoState(), flagshipRole.today)}
        status="failed"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry import" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith("reject"));
  });

  it("explains setup-only device work and delegates Not now", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const state = mergeSetup(createDemoState(), {
      ...createDemoState().setup,
      weeklyMinutes: 300,
      targetWeeks: 12,
    });

    render(
      <MigrationBanner
        onDismiss={onDismiss}
        onImport={vi.fn()}
        state={state}
        status="available"
      />,
    );

    expect(screen.getByText(/Beginner · 300 min\/week · 12 weeks/)).toBeInTheDocument();
    expect(screen.getByText(/0 completed units · 0 proofs/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
