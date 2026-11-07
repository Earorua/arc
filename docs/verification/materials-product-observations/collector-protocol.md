# Offline product projection observation protocol

`collect-projections.ts` exports the synchronous `collectProjectionObservations(inputJson: string)` API. It accepts only JSON text containing authored synthetic scenarios. It calls the real `validateDocumentExtraction` once per scenario with the fixed `KIMI_GROUNDED_TERMS_POLICY_ID`, then calls the real `mapMaterialItemTerms` and `mapMaterialItems` with `flagshipBlueprint` and `flagshipUnitRegistry` after a successful projection. It makes no network or model call, writes no file, and reads no environment credential.

This is component observation tooling. The source reference is an explicitly authored fixture, not an authenticated repository record. A projected item has not been confirmed by a user. `learningIntentItemIds` is an explicit mapper stimulus; its presence does not establish service eligibility, adoption, preview acceptance, or planning behavior. No expected course answer, scorer helper, planning reference, manual mapping, or caller-selected catalog reaches a product call.

## Input

```ts
type CollectionInput = {
  schemaVersion: "materials-product-projection-input-1";
  provenance: { kind: "constructed-control"; description: string };
  scenarios: Array<{
    id: string;
    ownerId: string;
    reference: {
      ownerId: string;
      documentId: string;
      documentVersionId: string;
      textVersionId: string;
      lifecycle: "active" | "revoked";
      text: string;
      segments: Array<{ id: string; start: number; end: number }>;
    };
    extraction: unknown;
    learningIntentItemIds: string[];
  }>;
};
```

The whole input is limited to **8 MiB of UTF-8**, with 1–512 scenarios and unique scenario IDs. Description is 1–2,000 UTF-16 code units and must contain non-whitespace. The wrapper, provenance, scenario, reference, and segment objects are strict: additional fields are rejected. Extraction is required but deliberately remains arbitrary JSON so malformed canonical candidates can be observed as native product rejections. Overflowing numeric literals that parse to non-finite values are rejected rather than silently converted to null.

Fixture document/version/text/segment and scenario IDs use the actual `materialIdSchema` (at most 256 characters, lowercase alphanumeric words separated by hyphens). Both owner fields use `materialOwnerIdSchema` (at most 256 characters, ASCII letters, digits, underscores, and hyphens). Source text uses the actual `documentTextSchema`: nonempty, at most 50,000 Unicode code points, 100,000 UTF-16 code units, and 256 KiB UTF-8. Fixtures may have 0–1,000 segments, with unique IDs and integer offsets from 0 through 100,000, within the text, nonempty, and never splitting a surrogate pair. Empty segment lists do not create a usable source span.

Intent IDs are unique, limited to 100, use the same ID syntax, and must name submitted candidate IDs. This membership check does not validate the candidate or invent adoption eligibility. A malformed extraction with no intent still reaches the native validator. Valid-syntax owner mismatch, revoked sources, unsupported quotes, and nonexistent segments likewise reach the native validator; malformed fixture syntax and boundaries fail the input contract first.

## Observations and permanent gaps

The result has `schemaVersion: "materials-product-projection-observations-1"`, the input provenance, and ordered `scenarios`. Each scenario includes its ID, owner, input hash, raw extraction, complete source fixture reference, and explicit intent IDs. `sourceFixture.authenticatedRepositoryRecord` is always false.

A scenario with `outcome: "projected"` contains the exact native `projection` (including items, retained hints, and unresolved review points), `termMappings`, and `itemMappings`. There is no confirmation or self-assessment adoption call. `labelRemovals` records each candidate ID with the submitted labels, canonical validated labels, projected labels, and removed canonical labels. The extra validated list distinguishes native whitespace trimming from actual removal; raw extraction is unchanged.

Every scenario records `native-task-coverage-absent`. Each projected candidate whose skill list is empty also records `empty-term-list` with its item ID. Native empty arrays remain empty; an empty non-learning constraint may still have the native non-learning item group. No null-term entry, substitute topic, inferred unit coverage, or constraint-derived planning output is created. There are no `courseObservations` or `planObservations` fields.

Only `DocumentServiceError` with code `invalid-content` becomes `outcome: "rejected"` and `rejection: { code: "invalid-content" }`. Such observations retain the original inputs and have no projection, mapping, or removal output. Other errors propagate from the API and fail the entire collection. For example, two source-distinct review points that resolve to an identical native review-point ID currently cause a native `ZodError`; the collector does not disguise it as a normal rejection.

Every result permanently carries:

```json
{
  "actualModelQualityEvaluated": false,
  "actualProductIntegrationVerified": false,
  "qualificationApproved": false,
  "realModelCalls": 0,
  "candidateEvaluation": {
    "status": "incomplete",
    "missingEvidence": [
      "native-task-coverage",
      "native-plan-observations",
      "actual-model-output",
      "user-facing-product-integration"
    ]
  }
}
```

These values never depend on observed mapping success. This collector cannot produce a model quality score, integration success, Gate pass, or complete candidate evaluation. It does not change the historical 30 real inferences / USD 0.547151 / unsettled 0 totals.

## Hashes and provenance

`inputSha256` hashes the exact UTF-8 encoding of the API's JSON string, including whitespace and key order. Each scenario's `inputSha256` hashes its canonical JSON with lexicographically sorted object keys, retained array order, and no excluded metadata keys. Catalog `canonicalSha256` values use the same encoding over the actual published objects. Canonical serialization is iterative so nested malformed extraction JSON can be preserved. No clock, generated run ID, environment value, or current working directory enters the result.

`product` records the fixed policy ID, `MATERIAL_MAPPING_VERSION`, and the actual blueprint/registry IDs, versions, and canonical hashes. `product.codeProvenance.files` lists the explicit relevant local file paths and SHA-256 of their current raw bytes. Its scope is `declared-relevant-files-only` and `completeRuntimeAttestation` is always false. The list is **partial code evidence**, not a dependency closure, proof of loaded-module identity, or complete runtime attestation. Files must remain stable during collection. The separate run report must freeze the input/output bytes, scripts, wrapper and denial logs, runtime/tool versions, and required product/frozen-reference digests.

## CLI and offline verification

The CLI accepts exactly one local JSON file path. It rejects option arguments, stdin shorthand, URL schemes, and UNC paths. It requires a regular file, reads no more than 8 MiB + 1 bytes, and decodes UTF-8 with fatal errors. A UTF-8 BOM is preserved for JSON parsing rather than silently excluded from the input hash. It opens no output file and never chooses or overwrites an evidence destination. Importing the API does not execute the CLI; entry is guarded by `import.meta.url`.

- Exit **1**: collection succeeded and stdout contains the JSON result; the evaluation is intentionally incomplete, including when some or all native candidates were rejected.
- Exit **2**: no report; stderr is one short `projection-collector: <code>` line. Codes are `usage`, `unreadable-input`, `input-too-large`, `invalid-utf8`, `invalid-json`, `invalid-input`, or `implementation-error`. Unexpected details remain available to API callers and are not exposed in CLI diagnostics.

Run every Node check through the existing offline wrapper, choosing a fresh label each time:

```powershell
node work/grounded-verification/run.mjs <unique-run-label> --import tsx --test docs/verification/materials-product-observations/collect-projections.test.ts
node work/grounded-verification/run.mjs <another-unique-run-label> node_modules/eslint/bin/eslint.js docs/verification/materials-product-observations/collect-projections.ts docs/verification/materials-product-observations/collect-projections.test.ts
```

The initial scaffold's genuine assertion Red run is preserved as `work/grounded-verification/product-projections-author-red-20261107.log` and the wrapper-owned `.json` metadata. Do not reuse its label or overwrite any previous verification evidence. For collection runs, the wrapper owns `<run-label>.json`; any separately captured report must use a distinct name such as `<run-label>-results.json`. Freezing the complete runtime evidence and batch observations belongs to the separate report workflow.
