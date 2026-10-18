export const MIGRATIONS = [
  ["0000_beta_foundation.sql", "1e92f53ce6aeec38c3c39d4e5c77f86d9e44d08a4b4f30d425094736b99cbde8"],
  ["0001_secure_account_linking.sql", "666fb7dc150a1106bd68726e4c8b6286c3908e56b8fc86c5518b2f8d4a384445"],
  ["0002_product_intelligence.sql", "52d1203563d185e09a3b098a57df053658f3b44ddd94e8c3c268dde4abab9847"],
  ["0003_adaptive_planning.sql", "e113c423bb4cef4c46c4cbef7c13a7d9ba40f1e666baa3d458acbd8959c49580"],
  ["0004_proof_backed_stack.sql", "dd16d381d8b766773a388e46ec6b138e4a8878f649768aa8d0296b3cf6caf19d"],
  ["0005_openrouter_research_beta.sql", "bbecea2119999103906e3c721d602467124a60f72ad9c672ae847212fe52ee35"],
  ["0006_research_health_indexes.sql", "24caea1c12c3ffa16b7b03c4f0a5a9c21736501b6dc2b2f2afbd149e6da78b73"],
];

export const LEGACY_TABLES = [
  "account_link_intents", "accounts", "ai_runs", "auth_rate_limits", "career_goals",
  "endpoint_rate_buckets", "feature_flags", "idempotency_records", "learner_profiles",
  "learning_events", "learning_tasks", "migration_runs", "operational_events", "proof_assets",
  "proof_items", "public_proof_shares", "quota_ledger", "sessions", "users", "verifications",
].sort();

export const RESTORE_ORDER = [
  "users", "verifications", "auth_rate_limits", "endpoint_rate_buckets", "operational_events",
  "feature_flags", "accounts", "sessions", "learner_profiles", "account_link_intents",
  "career_goals", "learning_tasks", "learning_events", "proof_items", "proof_assets",
  "public_proof_shares", "quota_ledger", "idempotency_records", "migration_runs", "ai_runs",
];

const T = 1_700_000_000_000;
const json = (value) => JSON.stringify(value);

export const LEGACY_ROWS = {
  users: [
    { id: "usr-a", name: "Ada 合成", email: "ada.synthetic@example.invalid", email_verified: 1, image: null, created_at: T, updated_at: T + 1 },
    { id: "usr-b", name: "Björk O'Fixture", email: "bjork.synthetic@example.invalid", email_verified: 0, image: "https://assets.example.invalid/avatar-b.png", created_at: T + 2, updated_at: T + 3 },
  ],
  verifications: [
    { id: "verify-a", identifier: "ada.synthetic@example.invalid", value: "synthetic-verification-value-a", expires_at: T + 90_000, created_at: T + 4, updated_at: T + 5 },
    { id: "verify-b", identifier: "bjork.synthetic@example.invalid", value: "synthetic-verification-value-b", expires_at: T - 90_000, created_at: T + 6, updated_at: T + 7 },
  ],
  auth_rate_limits: [
    { id: "auth-rate-a", key: "synthetic:login:a", count: 1, last_request: T + 8 },
    { id: "auth-rate-b", key: "synthetic:login:b", count: 3, last_request: T + 9 },
  ],
  endpoint_rate_buckets: [
    { id: "endpoint-a", scope: "synthetic-preview", subject_hash: "synthetic-subject-hash-a", window_start: T, count: 2, expires_at: T + 60_000 },
    { id: "endpoint-b", scope: "synthetic-proof", subject_hash: "synthetic-subject-hash-b", window_start: T, count: 1, expires_at: T + 60_000 },
  ],
  operational_events: [
    { id: "op-a", request_id: "synthetic-request-a", route: "/synthetic/learn", result_code: "ok", latency_ms: 12, user_surrogate: "synthetic-user-a", counters_json: json({ accepted: 1, note: "line one\nline two" }), occurred_at: T + 10 },
    { id: "op-b", request_id: "synthetic-request-b", route: "/synthetic/proof", result_code: "rejected", latency_ms: 19, user_surrogate: null, counters_json: json({ rejected: 1, quoted: "'fixture'" }), occurred_at: T + 11 },
  ],
  feature_flags: [
    { key: "synthetic-enabled", enabled: 1, cohort_json: json({ userIds: ["usr-a"] }), updated_at: T + 12 },
    { key: "synthetic-disabled", enabled: 0, cohort_json: "{}", updated_at: T + 13 },
  ],
  accounts: [
    { id: "acct-a", account_id: "synthetic-provider-account-a", provider_id: "synthetic-oauth", user_id: "usr-a", access_token: null, refresh_token: null, id_token: null, access_token_expires_at: null, refresh_token_expires_at: null, scope: null, password: null, created_at: T + 14, updated_at: T + 15 },
    { id: "acct-b", account_id: "synthetic-provider-account-b", provider_id: "synthetic-password", user_id: "usr-b", access_token: null, refresh_token: null, id_token: null, access_token_expires_at: null, refresh_token_expires_at: null, scope: "synthetic:read", password: "synthetic-password-hash-not-a-credential", created_at: T + 16, updated_at: T + 17 },
  ],
  sessions: [
    { id: "session-a", expires_at: T + 86_400_000, token: "synthetic-session-token-a", created_at: T + 18, updated_at: T + 19, ip_address: "192.0.2.10", user_agent: "Synthetic Browser/1", user_id: "usr-a" },
    { id: "session-b", expires_at: T - 1, token: "synthetic-session-token-b-expired", created_at: T + 20, updated_at: T + 21, ip_address: null, user_agent: null, user_id: "usr-b" },
  ],
  learner_profiles: [
    { id: "profile-a", user_id: "usr-a", state_version: 2, created_at: T + 22, updated_at: T + 23 },
    { id: "profile-b", user_id: "usr-b", state_version: 1, created_at: T + 24, updated_at: T + 25 },
  ],
  account_link_intents: [
    { id: "link-a", token_hash: "synthetic-link-hash-a", user_id: "usr-a", source_provider: "google", target_provider: "github", status: "completed", expires_at: T + 120_000, verified_at: T + 30, consumed_at: T + 31, completed_at: T + 32, failure_code: null, created_at: T + 26, updated_at: T + 32 },
    { id: "link-b", token_hash: "synthetic-link-hash-b", user_id: "usr-b", source_provider: "github", target_provider: "google", status: "failed", expires_at: T - 120_000, verified_at: null, consumed_at: null, completed_at: null, failure_code: "synthetic-expired", created_at: T + 27, updated_at: T + 28 },
  ],
  career_goals: [
    { id: "goal-a-active", user_id: "usr-a", role_id: "synthetic-role-a", level: "intermediate", weekly_minutes: 180, target_weeks: 8, status: "active", active_slot: 1, created_at: T + 40, updated_at: T + 41 },
    { id: "goal-a-history-1", user_id: "usr-a", role_id: "synthetic-role-old-1", level: "beginner", weekly_minutes: 90, target_weeks: 4, status: "archived", active_slot: null, created_at: T + 42, updated_at: T + 43 },
    { id: "goal-a-history-2", user_id: "usr-a", role_id: "synthetic-role-old-2", level: "advanced", weekly_minutes: 120, target_weeks: 6, status: "archived", active_slot: null, created_at: T + 44, updated_at: T + 45 },
    { id: "goal-b-active", user_id: "usr-b", role_id: "synthetic-role-b", level: "advanced", weekly_minutes: 240, target_weeks: 10, status: "active", active_slot: 1, created_at: T + 46, updated_at: T + 47 },
  ],
  learning_tasks: [
    { id: "task-row-a-planned", user_id: "usr-a", goal_id: "goal-a-active", unit_id: "unit-a-planned", title: "Plan résumé review", deliverable: "A synthetic outline\nwith a second line", skill_ids_json: json(["skill-α"]), status: "planned", sort_order: 1, created_at: T + 50, updated_at: T + 51 },
    { id: "task-row-a-complete", user_id: "usr-a", goal_id: "goal-a-active", unit_id: "unit-a-complete", title: "Finish quoted 'demo'", deliverable: "Synthetic artifact", skill_ids_json: json(["skill-β", "skill-json"]), status: "completed", sort_order: 2, created_at: T + 52, updated_at: T + 53 },
    { id: "task-row-b-complete", user_id: "usr-b", goal_id: "goal-b-active", unit_id: "unit-b-complete", title: "演练任务", deliverable: "仅合成内容", skill_ids_json: "[]", status: "completed", sort_order: 1, created_at: T + 54, updated_at: T + 55 },
  ],
  learning_events: [
    { id: "event-a-delayed", user_id: "usr-a", goal_id: "goal-a-active", task_id: "unit-a-planned", mutation_id: "event-mutation-a", kind: "delayed", payload_json: json({ original: "line 1\nline 2", nullable: null }), created_at: T + 60 },
    { id: "event-a-complete", user_id: "usr-a", goal_id: "goal-a-active", task_id: "unit-a-complete", mutation_id: "event-mutation-b", kind: "completed", payload_json: json({ score: 1 }), created_at: T + 61 },
    { id: "event-b-complete", user_id: "usr-b", goal_id: "goal-b-active", task_id: "unit-b-complete", mutation_id: "event-mutation-c", kind: "completed", payload_json: json({ imported: false }), created_at: T + 62 },
    { id: "event-b-imported", user_id: "usr-b", goal_id: "goal-b-active", task_id: "unit-b-imported-no-task-row", mutation_id: "event-mutation-d", kind: "completed", payload_json: json({ imported: true }), created_at: T + 63 },
  ],
  proof_items: [
    { id: "proof-a", user_id: "usr-a", goal_id: "goal-a-active", source_task_id: "unit-a-complete", title: "Synthetic résumé proof", kind: "upload", skill_ids_json: json(["skill-α"]), verified: 1, created_at: T + 70, updated_at: T + 71 },
    { id: "proof-a-imported", user_id: "usr-a", goal_id: "goal-a-history-1", source_task_id: null, title: "Imported proof — α", kind: "project", skill_ids_json: "[]", verified: 0, created_at: T + 72, updated_at: T + 73 },
    { id: "proof-b", user_id: "usr-b", goal_id: "goal-b-active", source_task_id: "unit-b-complete", title: "合成证明", kind: "upload", skill_ids_json: json(["skill-β"]), verified: 1, created_at: T + 74, updated_at: T + 75 },
    { id: "proof-b-imported", user_id: "usr-b", goal_id: "goal-b-active", source_task_id: null, title: "Imported proof B", kind: "note", skill_ids_json: json(["skill-note"]), verified: 0, created_at: T + 76, updated_at: T + 77 },
  ],
  proof_assets: [
    { id: "asset-a", user_id: "usr-a", proof_id: "proof-a", object_key: "synthetic/usr-a/proof-a.txt", filename: "résumé-proof.txt", content_type: "text/plain; charset=utf-8", size_bytes: 35, created_at: T + 80 },
    { id: "asset-b", user_id: "usr-b", proof_id: "proof-b", object_key: "synthetic/usr-b/proof-b.bin", filename: "proof-b.bin", content_type: "application/octet-stream", size_bytes: 9, created_at: T + 81 },
  ],
  public_proof_shares: [
    { id: "share-a", user_id: "usr-a", proof_id: "proof-a", token_hash: "synthetic-public-token-hash-a", published_fields_json: json(["title", "kind"]), public_view_json: json({ title: "Synthetic résumé proof", note: "public" }), revoked_at: null, created_at: T + 90, updated_at: T + 91 },
    { id: "share-b", user_id: "usr-b", proof_id: "proof-b", token_hash: "synthetic-public-token-hash-b", published_fields_json: json(["title"]), public_view_json: json({ title: "合成证明" }), revoked_at: T + 93, created_at: T + 92, updated_at: T + 93 },
  ],
  quota_ledger: [
    { id: "quota-a-reserve", user_id: "usr-a", purpose: "synthetic-preview", reservation_id: "reservation-a", idempotency_key: "quota-a", entry_kind: "reserved", units: 2, created_at: T + 100 },
    { id: "quota-a-accept", user_id: "usr-a", purpose: "synthetic-preview", reservation_id: "reservation-a", idempotency_key: "quota-a", entry_kind: "accepted", units: 1, created_at: T + 101 },
    { id: "quota-b-reserve", user_id: "usr-b", purpose: "synthetic-preview", reservation_id: "reservation-b", idempotency_key: "quota-b", entry_kind: "reserved", units: 1, created_at: T + 102 },
    { id: "quota-b-reject", user_id: "usr-b", purpose: "synthetic-preview", reservation_id: "reservation-b", idempotency_key: "quota-b", entry_kind: "rejected", units: 0, created_at: T + 103 },
  ],
  idempotency_records: [
    { id: "idem-a", user_id: "usr-a", scope: "synthetic-complete", mutation_id: "idem-mutation-a", response_json: "{ \"z\": 1, \"a\": \"quote: \\\"yes\\\"\\nsecond line\", \"nullable\": null }", created_at: T + 110 },
    { id: "idem-b", user_id: "usr-b", scope: "synthetic-plan", mutation_id: "idem-mutation-b", response_json: json({ ok: false, reason: null }), created_at: T + 111 },
  ],
  migration_runs: [
    { id: "device-migration-a", user_id: "usr-a", migration_id: "synthetic-device-import-v1", request_hash: "synthetic-request-hash-a", status: "completed", checkpoint_json: json({ imported: 3 }), result_json: json({ goals: 1 }), started_at: T + 120, completed_at: T + 121 },
    { id: "device-migration-b", user_id: "usr-b", migration_id: "synthetic-device-import-v1", request_hash: "synthetic-request-hash-b", status: "started", checkpoint_json: json({ imported: 1 }), result_json: null, started_at: T + 122, completed_at: null },
  ],
  ai_runs: [
    { id: "ai-a", user_id: "usr-a", request_id: "ai-request-a", purpose: "synthetic-preview", provider: "synthetic-provider", model: "synthetic-model", prompt_version: "fixture-v1", input_schema_version: "1", output_schema_version: "1", status: "accepted", usage_json: json({ units: 1 }), latency_ms: 10, error_code: null, created_at: T + 130 },
    { id: "ai-b", user_id: "usr-b", request_id: "ai-request-b", purpose: "synthetic-preview", provider: "synthetic-provider", model: "synthetic-model", prompt_version: "fixture-v1", input_schema_version: "1", output_schema_version: "1", status: "rejected", usage_json: json({ units: 0 }), latency_ms: 5, error_code: "synthetic-denied", created_at: T + 131 },
    { id: "ai-c", user_id: "usr-b", request_id: "ai-request-c", purpose: "synthetic-preview", provider: "synthetic-provider", model: "synthetic-model", prompt_version: "fixture-v1", input_schema_version: "1", output_schema_version: "1", status: "failed", usage_json: json({ units: 0 }), latency_ms: 7, error_code: "synthetic-failure", created_at: T + 132 },
  ],
};

export const LEGACY_OBJECTS = [
  {
    key: "synthetic/usr-a/proof-a.txt",
    bytes: Uint8Array.from([83, 121, 110, 116, 104, 101, 116, 105, 99, 32, 114, 101, 115, 117, 109, 101, 32, 45, 32, 228, 189, 160, 229, 165, 189, 10, 108, 105, 110, 101, 32, 116, 119, 111, 10]),
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    customMetadata: { fixture: "arc-v7.2-synthetic", owner: "usr-a" },
  },
  {
    key: "synthetic/usr-b/proof-b.bin",
    bytes: Uint8Array.from([0, 255, 1, 2, 10, 13, 34, 39, 128]),
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { fixture: "arc-v7.2-synthetic", owner: "usr-b" },
  },
];
