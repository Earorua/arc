# Arc. Public Beta Foundation Design

Date: 2026-07-28

Status: Approved written specification

Primary milestone: A real, publicly usable beta

Secondary constraints: portfolio quality and future infrastructure independence

## 1. Executive summary

Arc. will evolve from a polished, deterministic, device-local product demo into a real public beta with independent user identity, durable cloud state, controlled AI access, and an evidence-based learning loop.

The beta will be built as a sequence of deployable vertical slices. The first implementation slice covered by this specification is the **Beta Foundation**: public access, Google and GitHub identity, cloud persistence, local-to-cloud migration, server-only AI provider boundaries, quotas, operational controls, and production-grade failure handling. Live role research and adaptive plan generation follow in the next slice, on top of this foundation.

Arc. will remain an edge-deployed modular monolith. The initial hosting surface is OpenAI Sites with Cloudflare Workers, D1, and R2. Product and domain boundaries must remain portable so identity-bearing services can move to an owner-controlled Cloudflare account if Sites cannot safely support public Google and GitHub OAuth.

## 2. Current product state

The current public experience is a validated showcase release:

- eight routes cover the full learning story from setup through proof;
- the flagship AI full-stack engineer role contains a sourced, deterministic skill map;
- personalization, daily work, progress, stack state, and evidence are stored on the current device;
- local learning coverage is explicitly separated from external role readiness;
- no live model call, independent account, or cloud synchronization is active;
- the design thesis is **Warm Precision**: editorial typography, ivory and charcoal surfaces, restrained vermilion accents, and motion that explains state.

The showcase must stay publicly accessible and credible throughout the beta transition.

This specification supersedes the 2026-07-26 product design wherever the two differ on beta sequencing, authentication, or AI-key ownership. In particular, the first beta uses owner-funded server-side AI with quotas rather than user-supplied keys, and the public account requirement is Google and GitHub rather than a preselected authentication library. The earlier experience and visual decisions remain in force.

## 3. Goals

The Beta Foundation must:

1. keep public marketing, methodology, intelligence, and sample experiences accessible without sign-in;
2. provide independent Arc. accounts through Google and GitHub rather than ChatGPT identity;
3. make D1 the authoritative store for signed-in product data;
4. migrate existing device-local learning data without silent loss or duplication;
5. isolate product rules from hosting, database, identity, and AI provider implementations;
6. keep all AI credentials and model calls on the server;
7. enforce per-user quotas, a global budget ceiling, rate limits, and an emergency AI kill switch;
8. preserve a complete mock-provider path so the product can be tested without a paid model key;
9. provide actionable user-visible recovery states and privacy-preserving operational diagnostics;
10. remain deployable and reversible while the public site is active.

## 4. Non-goals for the Beta Foundation

This slice does not include:

- general-availability live role research;
- the complete adaptive learning-plan generator;
- user-supplied AI keys;
- subscriptions or payments;
- simultaneous active career paths;
- social feeds, comments, rankings, or teams;
- a course marketplace;
- unlimited file uploads;
- a custom-domain cutover;
- a native mobile application;
- microservices introduced only to showcase technology.

The interfaces required by role research and adaptive planning are included, but their live behavior belongs to the next implementation slice.

## 5. Product principles

1. **Value before identity.** A visitor can understand and try Arc. before being asked to sign in.
2. **Today is the product home.** Signed-in learners land on the next useful action, not a dashboard of metrics.
3. **AI is infrastructure, not the interface.** Arc. shows research progress, evidence, and decisions instead of centering a chat box.
4. **Plans are causal.** Skills have prerequisites, priority, evidence, provenance, and time implications.
5. **Progress requires evidence.** A percentage alone never proves mastery.
6. **Cloud state is authoritative after account creation.** Browser storage is limited to drafts, preferences, and a bounded offline mutation queue.
7. **No invisible overwrite.** Import, merge, replan, and public-sharing changes require explicit user intent.
8. **Failure preserves work.** A provider, upload, or synchronization failure must not erase an accepted plan or completed learning event.
9. **One surface, one primary decision.** Visual restraint remains a product rule, not merely a marketing style.

## 6. Experience architecture

### 6.1 Anonymous experience

Anonymous visitors can access:

- the public home page;
- Method and Intelligence explanations;
- the deterministic flagship path;
- a device-local setup draft and sample learning loop.

Anonymous use never consumes paid AI quota. The primary actions are **Explore a complete sample** and **Create my path**. Sign-in appears only when the visitor asks Arc. to save, synchronize, or begin real research.

### 6.2 Signed-in experience

Account creation uses Google or GitHub. After authentication, Arc. offers to import compatible local state before creating an empty cloud workspace.

The first setup asks one question per screen:

1. target role and optional role description;
2. existing capability or a request for future diagnosis;
3. real weekday and weekend availability;
4. desired outcome: job search, career change, independent building, or capability growth.

The signed-in primary navigation remains Today, Path, Stack, and Proof. Today is the default route.

### 6.3 Skill and proof states

Arc. represents skill evidence in four levels:

1. **Understand**: the learner can explain the concept;
2. **Practice**: the learner completed a focused exercise;
3. **Apply**: the learner used the skill in a project;
4. **Prove**: the learner attached verifiable code, work, writing, or certification evidence.

Proof is private by default. A public profile contains only items selected by the owner and can be revoked immediately.

## 7. System architecture

```text
Browser application
  |-- public editorial surfaces
  |-- anonymous local sample and draft state
  |-- signed-in product surfaces
  |-- bounded offline mutation queue
  |
  v
Arc. application services
  |-- Identity
  |-- Role Intelligence
  |-- Assessment
  |-- Planning
  |-- Daily Loop
  |-- Stack and Proof
  |-- Entitlements and Operations
  |
  +--> persistence ports ------> D1 / R2 adapters
  +--> identity port ---------> Sites-supported OAuth or owner Cloudflare adapter
  +--> AI provider port ------> mock provider / OpenAI Responses adapter
```

The application is a modular monolith deployed as Cloudflare Worker-compatible ESM. Route handlers and UI components may call application services but must not directly access D1, R2, OAuth SDKs, or a model SDK.

### 7.1 Module responsibilities

| Module | Responsibility |
| --- | --- |
| Identity | external identity mapping, sessions, account linking, and ownership context |
| Role Intelligence | research job lifecycle, sources, claims, and versioned role models |
| Assessment | learner capability inputs and skill-gap interpretation |
| Planning | skill dependencies, stages, plan versions, and time allocation |
| Daily Loop | task selection, completion events, feedback, and deterministic rescheduling |
| Stack | evidence-derived learner capability state |
| Proof | evidence metadata, private assets, and explicit public-share configuration |
| Entitlements | user quota, global budget, rate limits, and feature switches |
| AI Gateway | provider-neutral requests, schema validation, cost accounting, and safe failures |
| Persistence | D1 repositories, R2 object access, transactions, and migration boundaries |

## 8. Identity strategy and hosting gate

The product requires public Google and GitHub OAuth. ChatGPT identity is not an acceptable fallback.

Implementation starts with an authentication feasibility gate:

1. verify current Sites support for external OAuth callbacks, secure cookies, server-side session validation, runtime secrets, and required redirects;
2. document verified callback URLs and deployment behavior;
3. if Sites supports the complete flow, deploy identity and product APIs on Sites;
4. if Sites does not support the complete flow, move identity and account APIs to the owner's Cloudflare environment while the public editorial surface remains on Sites;
5. keep the browser-facing identity contract and domain services unchanged across both adapters.

The concrete OAuth library is an output of this capability gate rather than a precommitted product dependency. The selected implementation must satisfy the identity, session, callback, ownership, and portability contracts in this specification.

Authorization is always server-side. A valid session identifies a user but never substitutes for a resource ownership check.

Account-linking rules:

- one external identity maps to exactly one Arc. user;
- linking a second provider requires an authenticated session and verified provider callback;
- two existing Arc. accounts are never silently merged;
- a conflict produces a recoverable support state without exposing which account owns an identity;
- sign-out invalidates the Arc. session while leaving the external provider account untouched.

## 9. Persistence model

D1 stores structured, relational, user-owned product state. R2 stores bytes and generated exports. Browser storage is not authoritative after sign-in.

### 9.1 Core entity groups

**Identity and profile**

- users;
- external identities;
- sessions or session references;
- learner profiles and preferences.

**Goal and intelligence**

- career goals;
- role research runs;
- source records and extracted claims;
- immutable role-model versions;
- canonical skills and dependency edges.

**Learning state**

- assessments;
- immutable plan versions;
- plan stages and tasks;
- append-only completion and feedback events;
- derived user-skill states.

**Proof and sharing**

- evidence metadata;
- R2 object references;
- explicit public-share selections;
- revocable share handles or tokens.

**Operations**

- idempotency records;
- quota and cost ledger entries;
- feature-switch state;
- privacy-safe audit events.

All personal rows carry an owner identifier. Every repository operation accepts an authenticated ownership context. Public profile queries use a separate projection that can return only explicitly shared fields.

### 9.2 Versioning rules

- A meaningful new research result creates a new role-model version; it never overwrites the accepted historical graph.
- A material plan change creates a new plan version.
- Tasks reference their originating plan version.
- Completion, delay, skip, difficulty, and prior-knowledge feedback are append-only events.
- Derived progress and stack state can be recomputed from accepted versions and events.
- Model, prompt, provider, input schema, and output schema versions are recorded for every AI run.

## 10. Local-to-cloud migration and synchronization

### 10.1 Import flow

1. Detect a supported local data version after successful sign-in.
2. Show a summary of goals, progress, and evidence metadata available to import.
3. Require explicit confirmation.
4. Submit a size-limited, schema-validated package with a unique migration ID.
5. Import in an atomic operation where practical; otherwise record a resumable checkpoint.
6. Return a reconciliation summary.
7. Do not automatically delete the source local data in the first beta. After a successful reconciliation, the user may remove it explicitly.

A migration ID is idempotent. Retrying the same package cannot duplicate a completion, task, or evidence record. Existing cloud goals are not silently overwritten. The first beta supports one active goal; a conflicting imported goal is offered as an archived goal or requires the user to choose which goal remains active.

### 10.2 Ongoing synchronization

- D1 is authoritative after cloud activation.
- Each write uses a client mutation ID.
- Safe retries return the result of the original accepted mutation.
- Optimistic updates roll back when the server rejects a write.
- Offline writes remain in a visible queue capped at 100 mutations or 1 MiB, whichever is reached first, and synchronize when connectivity returns.
- When the offline queue is full, Arc. preserves queued work, switches new cloud-dependent writes to read-only mode, and asks the user to reconnect rather than discarding older mutations.
- Conflicting destructive edits require user reconciliation; ordinary append-only learning events deduplicate automatically.

## 11. AI gateway and future research engine

The Beta Foundation implements the provider contract and a deterministic mock provider. The first live provider in the next slice will use the OpenAI Responses API with web search and structured output. Provider details remain behind the gateway.

The gateway must:

- accept purpose-specific typed requests rather than arbitrary chat messages;
- check identity, entitlement, rate limit, global budget, and kill-switch state before a call;
- remove unnecessary personal data;
- enforce time, input-size, output-size, and tool boundaries;
- validate structured output before domain conversion;
- attempt at most one structured repair;
- record provider, model, purpose, latency, status, and normalized cost metadata without recording secrets;
- make provider replacement possible without changing domain consumers.

Web content is untrusted data. It cannot alter system instructions or gain database, file, or arbitrary tool access.

### 11.1 Research quality model for the next slice

Role research will use a query matrix spanning language, frontend, backend, data, cloud, DevOps, testing, security, observability, architecture, and collaboration. Sources serve different evidentiary purposes: job listings establish demand; official documentation establishes technology meaning and status; maintainer and high-quality industry material provide ecosystem context.

Research stops when all required dimensions have evidence and consecutive search passes no longer add high-value skills, or when the configured budget or time ceiling is reached. The result reports covered dimensions, weak evidence, unavailable sources, and the reason research stopped. High-impact skills should have independent corroboration or be marked provisional.

### 11.2 Planning responsibility split

AI may interpret unstructured descriptions, extract claims, normalize terminology, explain relevance, and propose complex replanning. Deterministic domain logic owns dependency ordering, time budgets, daily allocation, event processing, progress calculation, and quota charging.

## 12. Quotas, budgets, and operational controls

The site owner supplies live provider credentials as server-side runtime secrets. The browser never receives the key.

Before each paid request, Entitlements checks:

1. whether live AI is enabled globally;
2. whether the feature is enabled for the current release cohort;
3. whether the user has remaining quota;
4. whether request and daily rate limits allow the call;
5. whether the global budget ceiling allows expected spend.

Successful provider usage produces an append-only ledger entry. Failed research that produces no accepted artifact does not consume the user-facing completion allowance, although internal provider cost remains auditable. The kill switch prevents new paid calls without disabling deterministic sample, local learning, or cloud progress features.

Exact numerical quotas and budget amounts are runtime configuration, not hard-coded product behavior.

## 13. Privacy and security

- Collect only the identity and learning data required for the product.
- Use secure, HTTP-only, same-site cookies for Arc. sessions in either hosting branch.
- Validate callback state and protect write actions against cross-site request forgery as required by the session design.
- Validate every input at the server boundary.
- Enforce ownership on every personal read and write.
- Apply rate and size limits to authentication, import, evidence, and AI endpoints.
- Keep uploaded evidence private in R2 and serve it only through authorized or short-lived access paths.
- Never log access tokens, API keys, full private role descriptions, evidence bytes, or provider credentials.
- Keep proof private by default and require an explicit allowlist of fields for publication.
- Support immediate revocation of a public proof surface.
- Record security-relevant audit events without sensitive payload bodies.

## 14. Error handling and recovery

Errors use stable categories and a request ID. The UI translates them into an action the learner can take.

| Failure | Product behavior |
| --- | --- |
| OAuth cancelled or rejected | return to the prior public state with a clear retry action |
| expired or invalid session | preserve draft state and request sign-in again |
| identity-link conflict | stop linking, preserve both accounts, and show a safe recovery path |
| migration validation failure | import nothing and identify the unsupported data category |
| interrupted migration | resume from the recorded checkpoint or safely retry the same migration ID |
| optimistic write rejected | roll back the local projection and keep a retryable draft |
| offline state | allow supported local work and show the pending synchronization queue |
| quota exhausted | preserve existing learning features and show when access can resume |
| global AI kill switch | use deterministic or cached behavior and explain live research is unavailable |
| provider timeout or invalid output | preserve prior accepted state; retry safely or resume later |
| evidence upload failure | keep task completion separate from attachment status |
| unknown server failure | show a request ID and a safe retry without exposing internals |

## 15. Observability

Operational records include:

- request and correlation IDs;
- endpoint or use-case name;
- authenticated user surrogate, never a public identity value in ordinary logs;
- result category and sanitized error code;
- synchronization and migration checkpoint state;
- AI purpose, provider, model, latency, result status, and normalized usage;
- quota decisions and kill-switch decisions;
- security-relevant account and public-share events.

The initial admin surface is deliberately small: service health, current AI switch state, aggregate usage, recent sanitized failures, and migration health. It is not a general-purpose user-content viewer.

## 16. Validation strategy

### 16.1 Automated tests

**Domain unit tests**

- ownership-independent planning and event rules;
- active-goal and archive behavior;
- evidence-derived capability states;
- quota, budget, and kill-switch decisions;
- local import reconciliation and idempotency;
- offline mutation deduplication;
- public-proof field filtering.

**Persistence tests**

- schema and generated migrations;
- unique constraints and foreign-key behavior;
- owner-scoped repository queries;
- append-only event and ledger guarantees;
- resumable migration checkpoints.

**API and security tests**

- unauthenticated and expired-session behavior;
- cross-user access denial;
- invalid OAuth state and identity-link conflicts;
- malformed, oversized, and replayed requests;
- rate-limit and quota responses;
- private evidence and revoked share access.

**Provider contract tests**

- deterministic mock-provider success;
- typed request and structured response validation;
- one-repair maximum;
- provider timeout, invalid output, quota denial, and kill-switch behavior;
- proof that secrets never appear in serialized client state or ordinary logs.

**Integration tests**

- sign in, import local data, refresh, and recover cloud state;
- complete a task, refresh, and observe the same progress;
- retry the same mutation without duplicate effects;
- sign out and confirm private state is no longer readable;
- revoke a proof share and confirm public access ends.

### 16.2 Release verification

- TypeScript compilation, lint, unit tests, production build, and rendered-HTML checks pass.
- Every D1 schema change produces a reviewed migration stored with source.
- Existing public routes and the deterministic sample remain available.
- Mobile Today behavior, keyboard focus, reduced motion, loading, empty, and error states remain coherent with Warm Precision.
- A preview deployment passes smoke tests before the production release.
- Production deployment has a known rollback version and does not destructively rewrite existing device-local state.

## 17. Delivery sequence

### 17.1 Close design

- save this specification;
- scan for placeholders, contradictions, ambiguity, and accidental scope expansion;
- commit the specification;
- obtain written-spec approval;
- produce the task-level implementation plan.

### 17.2 Beta Foundation implementation

1. Reconfirm the existing build and test baseline on an isolated branch.
2. Complete the external-OAuth feasibility gate.
3. Establish identity ports and the selected adapter.
4. Add D1 and R2 logical bindings and reviewed migrations.
5. Implement owner-scoped repositories and application services.
6. Implement local-to-cloud import and cloud synchronization.
7. Add the mock-first AI Gateway, quota ledger, budget guard, and kill switch.
8. Integrate signed-in, synchronization, migration, offline, quota, and recovery states into the existing product experience.
9. Add observability and the minimal operational surface.
10. Run the complete automated and release verification suite.
11. Create a reviewable pull request and deploy a preview.
12. Publish only after the acceptance criteria pass, preserving a rollback point.

## 18. Acceptance criteria

The Beta Foundation is complete only when:

- public pages and the deterministic sample remain usable without sign-in;
- users can create independent Arc. accounts with Google or GitHub;
- no Arc. route requires ChatGPT identity;
- signed-in learning state survives refreshes and later sessions;
- compatible device-local data imports with preview, consent, and idempotency;
- cross-user reads and writes are denied;
- cloud state, offline queue state, and failed mutations are visibly distinguishable;
- AI credentials exist only in server runtime configuration;
- the mock-provider path exercises the complete provider contract without a key;
- per-user quotas, a global budget guard, rate limits, and an AI kill switch work before live AI is enabled;
- private proof remains private and public sharing is selective and revocable;
- required automated checks and migration review pass;
- the released version has a verified rollback path;
- the visual system and existing product narrative do not regress.

## 19. Decision record

- Primary outcome: real public beta; portfolio quality and infrastructure independence remain constraints.
- Delivery approach: deployable vertical slices rather than platform-first or intelligence-only development.
- Access: open registration with strict per-user quotas.
- Identity: Google and GitHub; no password login in the first beta.
- AI funding: owner-supplied server key with global budget controls and a kill switch.
- AI architecture: provider-neutral gateway; OpenAI Responses is the first planned live adapter.
- Infrastructure: Sites with D1 and R2 for the first beta when capability checks pass; preserve a path to owner-controlled Cloudflare.
- Product experience: public value before sign-in; Today as the signed-in home; AI remains behind a structured workflow.
- State: D1 is authoritative after sign-in; browser storage is limited to drafts, preferences, and a bounded offline queue.
- Scope: one active goal per user in the first beta; archived goals are permitted.
