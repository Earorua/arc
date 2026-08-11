import { describe, expect, it } from "vitest";
import { canonicalJson, deterministicId, fingerprint } from "../../../app/lib/planning/fingerprint";

describe("planning fingerprints", () => {
  it("canonicalizes recursively sorted object keys while preserving array order", () => {
    expect(canonicalJson({ zebra: [{ b: 2, a: 1 }, "last", "first"], alpha: { y: true, x: null } }))
      .toBe('{"alpha":{"x":null,"y":true},"zebra":[{"a":1,"b":2},"last","first"]}');
  });

  it("uses JSON scalar semantics consistently", () => {
    expect(canonicalJson({ quote: 'a\n"b', negativeZero: -0, number: 1.5 })).toBe('{"negativeZero":0,"number":1.5,"quote":"a\\n\\\"b"}');
  });

  it("rejects unsupported values, accessors, and cycles", () => {
    const accessor = {} as { value?: number };
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    for (const value of [undefined, () => undefined, Symbol("x"), BigInt(1), Number.NaN, Infinity, new Date(), new Map(), new Set(), accessor, cyclic, { nested: [undefined] }]) {
      expect(() => canonicalJson(value)).toThrow();
    }
  });

  it("uses descriptor snapshots without invoking proxy get traps", () => {
    let objectGets = 0;
    let arrayGets = 0;
    const object = new Proxy({ b: 2, a: 1 }, { get() { objectGets += 1; throw new Error("unexpected get"); } });
    const array = new Proxy(["first", "second"], { get() { arrayGets += 1; throw new Error("unexpected get"); } });

    expect(canonicalJson(object)).toBe('{"a":1,"b":2}');
    expect(canonicalJson(array)).toBe('["first","second"]');
    expect(fingerprint({ object, array })).toMatch(/^p2-[0-9a-f]{32}$/u);
    expect(objectGets).toBe(0);
    expect(arrayGets).toBe(0);
  });

  it("allows shared references but rejects null-prototype objects", () => {
    const shared = { minutes: 30 };
    expect(canonicalJson({ first: shared, second: shared })).toBe('{"first":{"minutes":30},"second":{"minutes":30}}');
    expect(() => canonicalJson(Object.create(null))).toThrow();
    const descriptorFailure = new Proxy({ a: 1 }, { getOwnPropertyDescriptor() { throw new Error("descriptor detail"); } });
    expect(() => canonicalJson(descriptorFailure)).toThrow("Value must be plain JSON");
  });

  it("produces stable known vectors", () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe("p2-5314055bb4d606bd32adba871e800499");
    expect(deterministicId("plan-version", { b: 2, a: 1 })).toBe("plan-version-5314055bb4d606bd32adba871e800499");
    expect(canonicalJson("\ud800")).toBe('"\\ud800"');
    expect(fingerprint("\ud800")).toBe("p2-3ffd2a2cb9154f9e6e3ac2986c125ffa");
  });

  it("hashes sorted object keys but preserves material array order", () => {
    expect(fingerprint({ a: 1, b: ["first", "second"] })).toBe(fingerprint({ b: ["first", "second"], a: 1 }));
    expect(fingerprint({ a: 1, b: ["first", "second"] })).not.toBe(fingerprint({ a: 1, b: ["second", "first"] }));
  });

  it("excludes only runtime metadata from fingerprints without mutating input", () => {
    const input = {
      title: "Learn TypeScript",
      createdAt: "2026-08-12T00:00:00Z",
      nested: { requestId: "request-1", minutes: 30, mutationIds: "material" },
      metadataNamesInArrays: ["createdAt", "eventId"],
    };
    const before = structuredClone(input);
    const sameMaterialInput = {
      ...input,
      createdAt: "2026-08-13T00:00:00Z",
      updatedAt: "2026-08-13T00:00:00Z",
      mutationId: "mutation-2",
      eventId: "event-2",
      sequence: 2,
      occurredAt: "2026-08-13T00:00:00Z",
      nested: { ...input.nested, requestId: "request-2", createdAt: "nested-created" },
    };

    expect(fingerprint(input)).toBe(fingerprint(sameMaterialInput));
    expect(fingerprint(input)).not.toBe(fingerprint({ ...input, title: "Learn Rust" }));
    expect(fingerprint(input)).not.toBe(fingerprint({ ...input, nested: { ...input.nested, mutationIds: "changed-material" } }));
    expect(fingerprint(input)).not.toBe(fingerprint({ ...input, metadataNamesInArrays: ["updatedAt", "eventId"] }));
    expect(input).toEqual(before);
  });

  it("validates deterministic ID prefixes", () => {
    expect(() => deterministicId("Plan-Version", { a: 1 })).toThrow();
    expect(() => deterministicId("plan--version", { a: 1 })).toThrow();
    expect(() => deterministicId("plan-version-", { a: 1 })).toThrow();
    expect(deterministicId("a".repeat(223), { a: 1 })).toHaveLength(256);
    expect(() => deterministicId("a".repeat(224), { a: 1 })).toThrow();
  });
});
