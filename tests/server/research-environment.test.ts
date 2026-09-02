import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  readResearchRuntimePolicy,
  type AdminEnvironment,
} from "../../app/server/admin/policy";

const validEnvironment: AdminEnvironment = {
  ARC_ADMIN_EMAILS: "owner@example.com",
  ARC_ENVIRONMENT: "test",
  BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "10000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1200",
  ARC_AI_REPAIR_MAX_COST_MICROS: "300",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

describe("Research Beta runtime environment", () => {
  it("documents only the exact disabled and empty Research Beta examples", () => {
    const source = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    for (const line of [
      "ARC_AI_RESEARCH_ENABLED=false",
      "ARC_AI_MODEL_RESEARCH=",
      "ARC_AI_MODEL_ECONOMY=",
      "ARC_AI_SITE_DAILY_BUDGET_MICROS=0",
      "ARC_AI_SITE_MONTHLY_BUDGET_MICROS=0",
      "ARC_AI_RESEARCH_MAX_COST_MICROS=0",
      "ARC_AI_REPAIR_MAX_COST_MICROS=0",
      "ARC_AI_RESEARCH_TIMEOUT_MS=20000",
      "ARC_AI_REPAIR_TIMEOUT_MS=10000",
      "ARC_AI_RESEARCH_CACHE_DAYS=14",
      "ARC_AI_IP_HASH_SALT=",
      "OPENROUTER_API_KEY=",
    ]) {
      expect(source.split(/\r?\n/u)).toContain(line);
    }
    expect(source).toContain("ARC_AI_ENABLED=false");
    expect(source).not.toMatch(/^OPENAI_API_KEY=/mu);
  });

  it("fails closed unless both exact switches and the complete Task 8 configuration are valid", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(readResearchRuntimePolicy(validEnvironment)).toEqual({ enabled: true });
    for (const environment of [
      {},
      { ...validEnvironment, ARC_AI_ENABLED: "false" },
      { ...validEnvironment, ARC_AI_RESEARCH_ENABLED: "false" },
      { ...validEnvironment, ARC_AI_MODEL_RESEARCH: "" },
      { ...validEnvironment, ARC_AI_MODEL_ECONOMY: "openrouter/auto" },
      { ...validEnvironment, ARC_AI_SITE_DAILY_BUDGET_MICROS: "0" },
      { ...validEnvironment, ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "invalid" },
      { ...validEnvironment, ARC_AI_RESEARCH_MAX_COST_MICROS: "0" },
      { ...validEnvironment, ARC_AI_RESEARCH_TIMEOUT_MS: "0" },
      { ...validEnvironment, ARC_AI_REPAIR_TIMEOUT_MS: "120001" },
      { ...validEnvironment, ARC_AI_RESEARCH_CACHE_DAYS: "0" },
      { ...validEnvironment, ARC_AI_IP_HASH_SALT: "short" },
      { ...validEnvironment, OPENROUTER_API_KEY: "" },
    ] satisfies AdminEnvironment[]) {
      expect(readResearchRuntimePolicy(environment)).toEqual({ enabled: false });
    }
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("returns no model, credential, salt, origin, or provider configuration", () => {
    const serialized = JSON.stringify(readResearchRuntimePolicy(validEnvironment));
    expect(serialized).toBe('{"enabled":true}');
    expect(serialized).not.toMatch(/model|credential|salt|origin|provider|openrouter|test\//iu);
  });

  it("declares every Research Beta Worker binding as an optional string without values", () => {
    const source = readFileSync(resolve(process.cwd(), "worker-configuration.d.ts"), "utf8");
    for (const name of [
      "ARC_AI_RESEARCH_ENABLED",
      "ARC_AI_MODEL_RESEARCH",
      "ARC_AI_MODEL_ECONOMY",
      "ARC_AI_SITE_DAILY_BUDGET_MICROS",
      "ARC_AI_SITE_MONTHLY_BUDGET_MICROS",
      "ARC_AI_RESEARCH_MAX_COST_MICROS",
      "ARC_AI_REPAIR_MAX_COST_MICROS",
      "ARC_AI_RESEARCH_TIMEOUT_MS",
      "ARC_AI_REPAIR_TIMEOUT_MS",
      "ARC_AI_RESEARCH_CACHE_DAYS",
      "ARC_AI_IP_HASH_SALT",
      "OPENROUTER_API_KEY",
    ]) {
      expect(source).toContain(`${name}?: string;`);
    }
    expect(source).not.toMatch(/OPENAI_API_KEY/u);
    expect(source).not.toMatch(/ARC_AI_(?:MODEL|IP_HASH_SALT)[^;]*=/u);
  });
});
