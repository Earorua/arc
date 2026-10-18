# Task15 deployment failure metadata

Scope: authorized local diagnostic correction only. The consumed scenario-ops-r1 activation and all frozen files remain immutable. No deployment, control call, retry, epoch reset or provider call is granted by this plan.

Observed problem: the 2026-10-14 activation child exited 1 after 8.8 seconds. Its result preserves output hashes but loses the error classification. Complete native reconciliation still observes the closed predecessor, no jobs, no outstanding budgets and no observer rows. Audit UI shows secret/workflow reads but no new upload or deployment; four subsequent Workflow reads succeed. The original root cause remains unknown.

Decision: add a small independent, pure projection helper and a metadata-only diagnostics_channel preload under outputs/local-durable-executor-20261014/deployment-diagnostic-r1. It will be available for a separately reviewed successor operation; do not wire it into frozen tools now. Reusing the existing read-only preload unchanged would still classify workflow reads as other and uses a broad error-code regex. Prefer exact finite allowlists for persisted output.

Implementation task:
- First write failing node:test tests. Add project.mjs and trace.cjs (a tiny shared enum module is acceptable) and local tests; no network, subprocess, environment/credential reading, files outside this directory or external dependencies in the helper.
- Accept already-bounded stdout/stderr from a caller. Return only schema tag, SHA-256 hashes, finite known transport codes, finite known Cloudflare numeric codes, and a bounded list of validated ARC_NET_META events. No raw text, error messages, URLs, headers, bodies, account identifiers or credentials may escape.
- Recognize transport codes only by exact allowlist. Recognize Cloudflare codes only in the CLI's explicit [code: N] syntax and a documented numeric allowlist; unknown values produce a boolean unknown diagnostic indicator, never an echoed value.
- Trace undici create/headers/trailers/error through diagnostics_channel without changing requests. Classify official Cloudflare host and fixed endpoint kinds including workflow-details, secrets, versions, deployments, bindings and schedules; emit only enum method/host/endpoint, bounded integers and exact allowlisted error codes. Cap emission at 120 events. Use a WeakMap for request correlation; no response/header inspection besides numeric status.
- Projection accepts only exact event schemas, finite integer bounds, fixed enum values, and at most 120 valid events. Fail closed on extra/unrecognized fields; cap processing/input to 524288 bytes and flag truncation rather than persisting raw input. Keep hashes of original input. Do not claim all failures can be identified.
- Tests include secret-shaped sentinel strings in arbitrary messages, URL/query/headers, unknown error-code strings, malformed/extra metadata fields, over-limit input/event counts, genuine known error/status events, hash integrity and a local mocked diagnostics_channel exercise proving the preload does not change request data. Tests need no cloud access.

Acceptance: focused tests and syntax checks pass; independent specification review then quality/security review finds no blocking issues. No live integration claim. A new operational decision must bind these helper hashes before any future use.

In parallel, Root may perform one delayed read-only reconciliation under the existing fixed incomplete closure deadline, retaining the original activation time and permanent INCOMPLETE outcome. Current allowance ends 2026-10-14T09:48:22.590Z and cannot be extended by this work.
