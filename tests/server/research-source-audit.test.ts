import { afterEach, describe, expect, it, vi } from "vitest";
import { researchCandidateSchema } from "../../app/contracts/research";
import { auditResearchSources, canonicalizePublicCitationUrl, readBoundedResearchJson, SourcePolicyError } from "../../app/server/research/source-audit";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

afterEach(() => vi.unstubAllGlobals());

describe("untrusted research JSON property-name bounds", () => {
  it("rejects a property name exceeding the per-string bound without exposing the name", () => {
    const key = "k".repeat(8_193);
    expect(() => readBoundedResearchJson({ [key]: null }))
      .toThrowError(new SourcePolicyError("invalid-schema"));
  });

  it("counts individually bounded property names toward the aggregate text budget", () => {
    const value = Object.fromEntries(Array.from({ length: 2_000 }, (_, index) => [
      `${String(index).padStart(4, "0")}-${"k".repeat(7_996)}`, null,
    ]));
    expect(Object.keys(value).every((key) => key.length <= 8_192)).toBe(true);
    expect(Object.keys(value).reduce((sum, key) => sum + key.length, 0)).toBeGreaterThan(16_000_000);
    expect(() => readBoundedResearchJson(value)).toThrowError(new SourcePolicyError("invalid-schema"));
  });
});

describe("public citation URL canonicalization", () => {
  it("normalizes HTTPS hosts, tracking parameters, fragments and query ordering", () => {
    expect(canonicalizePublicCitationUrl("https://DOCS.GetDbt.COM:443/guide?z=2&utm_source=search&a=1&fbclid=secret&gclid=secret#section"))
      .toBe("https://docs.getdbt.com/guide?a=1&z=2");
    expect(canonicalizePublicCitationUrl("https://docs.getdbt.com./guide?UTM_campaign=search"))
      .toBe("https://docs.getdbt.com/guide");
  });

  it.each([
    "http://docs.getdbt.com/", "javascript:alert(1)", "data:text/html,secret", "file:///secret",
    "https://user:secret@docs.getdbt.com/", "https://localhost/", "https://sub.localhost/",
    "https://127.0.0.1/", "https://8.8.8.8/", "https://127.1/", "https://2130706433/",
    "https://0x7f000001/", "https://0177.0.0.1/", "https://%31%32%37.0.0.1/",
    "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://foo.local/", "https://foo.internal/",
    "https://foo.test/", "https://foo.invalid/", "https://foo.example/", "https://foo.home.arpa/",
    "https://intranet/", "https://bad_host.com/", "https://-bad.com/", "https://bad-.com/",
    "https://bad..com/", "https://docs.getdbt.com\n/", "https://docs.getdbt.com/\u0000secret",
    "https://foo.onion/", "https://foo.alt/", "https://foo.lan/", "https://foo.home/", "https://foo.corp/",
    "https://docs.getdbt.com/%00secret", "https://docs.getdbt.com/?api%5Fkey=secret-value",
    "https://docs.getdbt.com/?access_token=secret-value",
    `https://docs.getdbt.com/${"数".repeat(700)}`,
    `https://${"a".repeat(64)}.com/`, `https://docs.getdbt.com/${"a".repeat(2048)}`,
  ])("rejects unsafe or malformed URL %s without echoing it", (url) => {
    try {
      canonicalizePublicCitationUrl(url);
      expect.fail("Unsafe citation was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(SourcePolicyError);
      expect(error).toMatchObject({ code: "unsafe-url", message: "Research source rejected: unsafe-url" });
    }
  });
});

describe("citation annotation auditing", () => {
  const candidate = () => researchCandidateSchema.parse(validResearchCandidate);
  it("audits only cited candidate resources without making network requests or retaining excerpts", () => {
    const fetch = vi.fn(() => { throw new Error("No network permitted"); });
    vi.stubGlobal("fetch", fetch);
    const { sources } = auditResearchSources(candidate(), validAnnotations, "2026-08-27");
    expect(sources).toHaveLength(6);
    expect(sources[0]).toEqual({
      canonicalUrl: validResearchCandidate.resources[0].url,
      title: validAnnotations[0]!.title,
      hostname: "docs.getdbt.com", sourceTier: "primary", observedAt: "2026-08-27",
      citationHash: expect.any(String),
    });
    expect(sources[0]!.citationHash.length).toBeGreaterThanOrEqual(16);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates canonical annotation identities and ignores unused safe annotations", () => {
    const duplicated = [...validAnnotations, { ...validAnnotations[0]!, url: `${validAnnotations[0]!.url}?utm_medium=web#extra` },
      { type: "url_citation", url: "https://example.com/unused", title: "Unused" }];
    const expected = auditResearchSources(candidate(), validAnnotations, "2026-08-27");
    expect(auditResearchSources(candidate(), duplicated, "2026-08-27")).toEqual(expected);
    expect(auditResearchSources(candidate(), validAnnotations, "2026-08-28").sources[0]!.citationHash)
      .toBe(expected.sources[0]!.citationHash);
  });

  it("matches canonicalized resource URLs to canonicalized annotation URLs", () => {
    const value = candidate();
    value.resources[0]!.url += "?utm_source=web#reference";
    expect(auditResearchSources(value, validAnnotations, "2026-08-27").sources).toHaveLength(6);
  });

  it("rejects any candidate resource lacking provider annotation backing", () => {
    expect(() => auditResearchSources(candidate(), validAnnotations.slice(1), "2026-08-27"))
      .toThrowError(new SourcePolicyError("unreferenced-url"));
    expect(() => auditResearchSources(candidate(), [], "2026-08-27"))
      .toThrowError(new SourcePolicyError("unreferenced-url"));
  });

  it.each([
    null,
    [{ ...validAnnotations[0], title: "x".repeat(501) }],
    [{ ...validAnnotations[0], excerpt: "secret" }],
    Array.from({ length: 257 }, () => validAnnotations[0]),
  ])("rejects malformed or oversized annotation collections", (annotations) => {
    expect(() => auditResearchSources(candidate(), annotations, "2026-08-27"))
      .toThrowError(new SourcePolicyError("invalid-schema"));
  });

  it("rejects unsafe unused annotations and unsafe titles rather than passing them through", () => {
    expect(() => auditResearchSources(candidate(), [...validAnnotations, { type: "url_citation", url: "https://127.0.0.1/secret", title: "Private" }], "2026-08-27"))
      .toThrowError(new SourcePolicyError("unsafe-url"));
    expect(() => auditResearchSources(candidate(), validAnnotations.map((a) => ({ ...a, title: "<script>secret</script>" })), "2026-08-27"))
      .toThrowError(new SourcePolicyError("unsafe-content"));
  });

  it("rejects invalid observed dates with sanitized errors", () => {
    expect(() => auditResearchSources(candidate(), validAnnotations, "2026-02-30"))
      .toThrowError(new SourcePolicyError("invalid-schema"));
  });

  it("does not count duplicated resource URLs as independent evidence", () => {
    const value = candidate();
    value.resources[1]!.url = `${value.resources[0]!.url}?utm_source=duplicate`;
    expect(auditResearchSources(value, validAnnotations, "2026-08-27").sources).toHaveLength(5);
  });
});
