import { describe, expect, it } from "vitest";
import {
  proofMutationResponseSchema,
  proofWorkspaceResponseSchema,
} from "../../app/contracts/proof-api";
import { proofResultFixture } from "../fixtures/proof-ledger";

describe("proof API contracts", () => {
  it("accepts only the locked workspace and mutation envelopes", () => {
    const result = proofResultFixture();
    expect(proofWorkspaceResponseSchema.parse({ workspace: result.workspace })).toEqual({ workspace: result.workspace });
    expect(proofWorkspaceResponseSchema.parse({ workspace: null })).toEqual({ workspace: null });
    expect(proofMutationResponseSchema.parse({ result })).toEqual({ result });
    expect(proofWorkspaceResponseSchema.safeParse({ workspace: null, ownerId: "private" }).success).toBe(false);
    expect(proofMutationResponseSchema.safeParse({ result, debug: true }).success).toBe(false);
  });
});
