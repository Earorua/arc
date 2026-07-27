import { describe, expect, it, vi } from "vitest";
import { AiGateway, InvalidProviderOutputError } from "../../app/server/ai/gateway";
import { MockAiProvider } from "../../app/server/ai/mock-provider";
import type { AiProvider } from "../../app/server/ai/contracts";

const request = {
  requestId: "00000000-0000-4000-8000-000000000001",
  role: "AI Product Engineer",
  locale: "en-US" as const,
};

function harness(provider: { run: ReturnType<typeof vi.fn>; repair: ReturnType<typeof vi.fn> }) {
  const entitlements = {
    authorize: vi.fn().mockResolvedValue({ allowed: true, reservationId: "reservation-1" }),
    finalize: vi.fn().mockResolvedValue(undefined),
  };
  const runs = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    gateway: new AiGateway({ provider: provider as unknown as AiProvider, entitlements, runs, now: () => 100 }),
    entitlements,
    runs,
  };
}

describe("AiGateway", () => {
  it("returns structured deterministic mock output and charges one accepted unit", async () => {
    const provider = new MockAiProvider();
    const entitlements = {
      authorize: vi.fn().mockResolvedValue({ allowed: true, reservationId: "reservation-1" }),
      finalize: vi.fn().mockResolvedValue(undefined),
    };
    const runs = { record: vi.fn().mockResolvedValue(undefined) };
    const gateway = new AiGateway({ provider, entitlements, runs, now: () => 100 });

    const result = await gateway.research("user-owner", request);

    expect(result).toMatchObject({
      accepted: true,
      preview: {
        role: "AI Product Engineer",
        mode: "deterministic-preview",
      },
    });
    expect(result.accepted && result.preview.dimensions.length).toBeGreaterThan(0);
    expect(entitlements.finalize).toHaveBeenCalledWith("reservation-1", "accepted", 1);
    expect(runs.record).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-owner",
      requestId: request.requestId,
      status: "accepted",
      provider: "deterministic-mock",
    }));
  });

  it("repairs invalid provider output at most once", async () => {
    const provider = {
      run: vi.fn().mockResolvedValue({ bad: true }),
      repair: vi.fn().mockResolvedValue({
        role: request.role,
        mode: "deterministic-preview",
        dimensions: ["Product judgment"],
        notice: "Preview only.",
      }),
    };
    const { gateway } = harness(provider);

    await expect(gateway.research("user-owner", request)).resolves.toMatchObject({ accepted: true });
    expect(provider.run).toHaveBeenCalledOnce();
    expect(provider.repair).toHaveBeenCalledOnce();
  });

  it("rejects a second invalid output and records no accepted charge", async () => {
    const provider = {
      run: vi.fn().mockResolvedValue({ bad: true }),
      repair: vi.fn().mockResolvedValue({ stillBad: true }),
    };
    const { gateway, entitlements, runs } = harness(provider);

    await expect(gateway.research("user-owner", request)).rejects.toBeInstanceOf(InvalidProviderOutputError);
    expect(provider.repair).toHaveBeenCalledOnce();
    expect(entitlements.finalize).toHaveBeenCalledWith("reservation-1", "rejected", 0);
    expect(entitlements.finalize).not.toHaveBeenCalledWith("reservation-1", "accepted", expect.anything());
    expect(runs.record).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
  });

  it("does not call a provider when entitlement is denied", async () => {
    const provider = { run: vi.fn(), repair: vi.fn() };
    const { gateway, entitlements } = harness(provider);
    entitlements.authorize.mockResolvedValue({ allowed: false, reason: "budget" });

    await expect(gateway.research("user-owner", request)).resolves.toEqual({
      accepted: false,
      reason: "budget",
    });
    expect(provider.run).not.toHaveBeenCalled();
    expect(entitlements.finalize).not.toHaveBeenCalled();
  });
});
