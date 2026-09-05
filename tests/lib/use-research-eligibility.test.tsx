import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readResearchEligibility, useResearchEligibility } from "../../app/lib/use-research-eligibility";
afterEach(cleanup);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const response = (eligible = true) => Response.json({ eligible, requestId: "request-one" });
describe("Research eligibility", () => {
  it("defaults false and aborts/discards late completion after account change and unmount", async () => {
    const first = deferred<Response>(); const second = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender, unmount } = renderHook(({ id }) => useResearchEligibility({ userId: id, fetch: fetcher }), { initialProps: { id: "owner-a" as string | null } });
    expect(result.current.eligible).toBe(false);
    rerender({ id: "owner-b" }); expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    await act(async () => { first.resolve(response()); }); expect(result.current.eligible).toBe(false);
    await act(async () => { second.resolve(response()); }); expect(result.current.eligible).toBe(true);
    rerender({ id: null }); expect(result.current.eligible).toBe(false); unmount();
    expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("never exposes previous eligibility in a committed identity transition layout effect", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockImplementation(() => new Promise(() => {}));
    const seen: boolean[] = [];
    const { result, rerender } = renderHook(({ id }) => { const value = useResearchEligibility({ userId: id, fetch: fetcher }); useLayoutEffect(() => { seen.push(value.eligible); }, [id, value.eligible]); return value; }, { initialProps: { id: "owner-a" } });
    await act(async () => {}); expect(result.current.eligible).toBe(true);
    rerender({ id: "owner-b" }); expect(seen.at(-1)).toBe(false);
  });
  it.each([Response.json({ eligible: "true", requestId: "r" }), Response.json({ eligible: true, requestId: "r", owner: "hidden" }), new Response("x".repeat(2049)), responseWithStatus(), new Response("{}", { headers: { "content-length": "999999" } })])("fails closed for invalid or oversized responses", async (reply) => {
    await expect(readResearchEligibility(new AbortController().signal, vi.fn().mockResolvedValue(reply))).resolves.toBe(false);
  });
  it("cancels an unfinished response stream on abort", async () => {
    const cancel = vi.fn(); const token = new AbortController();
    const pending = readResearchEligibility(token.signal, vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } })));
    await Promise.resolve(); token.abort(); await expect(pending).resolves.toBe(false); expect(cancel).toHaveBeenCalled();
  });
  it("fails closed for a non-JSON content type even if the body has the capability shape", async () => {
    await expect(readResearchEligibility(new AbortController().signal, vi.fn().mockResolvedValue(new Response('{"eligible":true,"requestId":"r"}', { headers: { "content-type": "text/html" } })))).resolves.toBe(false);
  });
  it("cancels oversized chunked UTF-8 content without trusting content length", async () => {
    const cancel = vi.fn();
    const reply = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("学".repeat(800))); }, cancel }), { headers: { "content-type": "application/json" } });
    await expect(readResearchEligibility(new AbortController().signal, vi.fn().mockResolvedValue(reply))).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
function responseWithStatus() { return Response.json({ eligible: true, requestId: "request-one" }, { status: 503 }); }
