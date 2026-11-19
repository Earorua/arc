CHANGES REQUESTED — bounded Task 3 fixed-operator specification review, 2026-11-19.

One actionable source-binding finding remains in this freeze. The other inspected operator boundaries align with the Task 3 plan and the reviewed account-evidence decision. This memo preserves the initial review; a correction should receive a separate narrow recheck. It does not approve a live packet, account funding, paid execution or release.

### Finding: require the fixed runtime documentation modules in the external packet

**[P2] `scripts/materials-current-quality-operator.ts:58`, with the verification loop at line 310.** `approval.attachments` accepts any one to 64 attachment records. It does not require the three current runtime modules under `docs/`, nor require their paths to be unique. The reused `inspectDiagnosticPilotSourceManifest` intentionally excludes all `docs/` paths. Consequently, an otherwise approved packet containing only an unrelated documentation attachment can satisfy the operator's source verification while omitting the executable current reader/adapter modules. Editing an omitted module would not fail that source-manifest or attachment comparison. `loadCurrentReviewedReferences` verifies the reference/native assets but does not pin the execution bytes of its own loader, capture reader or adapter.

This violates the fixed Task 3 source-binding requirement. Those modules construct or validate actual capture observations and the quality report. The source freeze must cover them before starting paid collection; a later report or the non-doc manifest cannot stand in for the missing commitments. Root confirmed that the planned packet requires exactly these runtime paths in addition to its evidence attachments:

- `docs/verification/materials-quality-next/current-references.mjs`
- `docs/verification/materials-quality-next/current-captures.ts`
- `docs/verification/materials-quality-next/current-adapter.ts`

Require each exact path once in the externally pinned attachment scope, reject missing or duplicate paths before key-dependent execution or startup claims, and retain the existing per-file byte checks at every send guard. Keep the historical source inspector, scorers and reference assets unchanged; no generic import-discovery engine is needed. A narrow regression should demonstrate each missing required module and duplicate-path rejection, with a valid complete scope retained. No probe is needed to establish the present omission: it follows directly from the schema, excluded-doc source inspector and verification loop.

### Reviewed boundaries that need no further expansion

The ordinary PowerShell path defaults to hidden-input account inspection and one fixed, bounded GET `/api/v1/key`. It has no packet, startup claim, inference POST, grant issuer, limit increase or account purchase. Insufficient current allowance remains inspectable and returns selected non-secret metadata without the key label or detailed budget identities in the terminal summary. Raw upstream errors and stderr are suppressed in favor of fixed refusal reasons. The launcher uses a hidden child, keeps the credential out of arguments and persisted settings, clears its temporary environment entry, disposes the secure input, and preserves the calling terminal on refusal. The saved test actually invokes PowerShell parsing and an invalid packet, observes code 2 before credential input and then executes the continuation marker.

Approved mode consumes an external packet digest, existing separate 24/six issuance files, distinct run and authorization IDs, a shared fresh window of at most two hours, exact configuration/request commitments and the candidate/packet commits. It does not create or renew a grant. Reviewed Credits evidence is separately pinned to the account/key/evidence hash, explicitly uses the whole-dollar floor of a two-decimal UI display rather than an exact Credits API balance, and must be at most fifteen minutes old at startup. No management key or `/credits` call is introduced. The ordinary key readback preserves number lexemes and uses conservative integer conversions for the key limit/usage/remaining and every returned enforcement budget; account, expiry, management/provisioning status and the fixed cap policy are checked. These are two distinct funding checks, not a claim that historical spending proves current funds.

The fixed scope retains USD 2.00 plus USD 0.45 grant budgets and USD 0.072960 per-document reservation. The existing source manifest checks non-doc Git bytes, fixtures, configs and lockfiles against the candidate; the packet also pins the request-draft manifest and compares real outgoing body digests, document order, endpoint and manual redirect mode at every handoff. Source checks and the approval window are rechecked before each inference. The required-doc scope finding above is the one missing part of that coverage.

The shared runner and supplement changes are denial-only hooks before `sent`/`markSending`. A refusal releases the local reservation and does not become an unknown paid request. The live six-document bridge fixes the actual transport, ledger location and candidate verifier; injectable fixtures retain their offline-only credential/mode restriction. Existing provider behavior remains one inference POST with up to three bounded generation GETs, and the absent historical supplement bound remains one. The fixture evidence confirms a later operator denial stops before the second POST while preserving the first response, settled receipt, journal and final result.

The existing six-document ledger identity and unresolved collecting/held state are inspected read-only before 24 and again before six. Both phases have separate exclusive, synced startup claims and retain their existing journals/ledgers. Six cannot begin unless the 24 captures are complete, all 24 ordered records are settled with unique verified receipts, the sum agrees, there is no held cost or stopping reason, and a fresh key readback covers the remaining scope. A settled quality failure does not authorize an inference retry or prevent faithful capture/scoring; quality and accounting remain separate. Source/body/window denial, persistence failure or incomplete capture prevents continuation. Existing history, course/source scorers, reference answers, native evidence and application behavior are outside the edits.

### Frozen source and saved evidence

Handoff `work/grounded-verification/course-relations-20261119-operator-handoff-01.json` matches SHA-256 `4e57e9b2b18d77bf52562b47ccbce4080c2f3ef62ac855c2856c9633b6afa7b8`. All seven frozen files independently match:

| File | SHA-256 |
| --- | --- |
| `scripts/materials-current-quality-operator.ts` | `c1507c7ac97d924ae32e673ba328b5dfe7ee5451a1358c06ba85994fa61c07b0` |
| `scripts/invoke-materials-current-quality.ps1` | `d54cd5b60cfa7bf231c6934fbfdb07630f9f27541b9b2ecddebbba683f7bc064` |
| `scripts/materials-qualification-runner.ts` | `fe1120a44f8d8dd79f702b45381ca3666b364d609acdd7ac75da157ca8017099` |
| `scripts/collect-materials-supplements.ts` | `33a9bcec44772776dddc498255f1cdf0303dab53050a456a2b062552877670d4` |
| `tests/server/materials-current-quality-operator.test.ts` | `b270e18a0830c9bfda7d600eb5e61b0111082ebbfed1032509723a7eb494e1f2` |
| `tests/server/document-model-qualification-guards.test.ts` | `43aa5eba691673296f1745b3f02ab924ec2ef2920bb0626a6077a927fb9e270a` |
| `tests/server/materials-supplement-collection.test.ts` | `700510fb8c70a4a45f22c7c787bcb5e2cebd3cee68dcdd1fcf9c53e538192124` |

All 21 raw-log hashes in the handoff match their saved files, including the retained REDs, initial compiler failure and transient lint warning. The affected run passes 83 tests across the 27-test runner guard suite, 49-test supplement suite and then-seven-test operator suite; raw log SHA-256 `e54c401776fb0112aa2c6d4ea6b6d78800a9a55ab970dbb419966cddf9d272f7`. The final operator run passes ten tests, raw log `edd2a1a5358429dd43bd93a7350818d0d4f7252b90f1d0202cc238643a6da206`. These runs overlap and are not summed. The shared collector pins remain those already accepted by binding v2.

The successful normal `tsconfig.json` invocation has an actual wrapper exit 0 and 17,426 ms duration; the saved scope contains 889 files including the new operator and test. Scope SHA-256 is `f3e9ba860dce73f266f017b1d2ed4c62e4295c9553cdfcbf83a30d8fb7c89c21`, using accepted config hash `5b2551b01448b64231114c46bd22e8b9bbf0dca4bfc15043e1a4a7157afcb653`. Compiler and final clean lint logs hash to `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. The only post-compiler source delta is the intentional `void _budgets` discard/comment; it changes no value, branch, type, import or output, so the recorded compiler result remains applicable. Earlier BigInt-target and child-process environment typing failures remain preserved.

Reviewer activity was source/diff/hash/raw-evidence inspection and this memo only. No tests, live metadata, key reads, model/network calls, native checks, product probes, source edits, staging or commits were performed. After the narrow source-scope repair and independent reviews, the final application acceptance, actual packet construction, fresh account observation and new explicit fee/cache approval remain separate work.
