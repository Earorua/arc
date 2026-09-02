import { z } from "zod";
import {
  readResearchProductionConfiguration,
  type ResearchProductionEnvironment,
} from "../research/service-factory";

export type AdminEnvironment = ResearchProductionEnvironment & {
  ARC_ADMIN_EMAILS?: string;
};

export type AdminPolicy = {
  configured: boolean;
  allows(email: string): boolean;
};

const adminEmailSchema = z.string()
  .trim()
  .toLowerCase()
  .max(254)
  .email()
  .refine((email) => !email.includes("*"), "Admin emails must be exact addresses.");

export function readAdminPolicy(environment: AdminEnvironment): AdminPolicy {
  const raw = environment.ARC_ADMIN_EMAILS;
  if (!raw?.trim()) return { configured: false, allows: () => false };
  const parsed = z.array(adminEmailSchema).min(1).max(32).safeParse(raw.split(","));
  if (!parsed.success) return { configured: false, allows: () => false };
  const allowlist = new Set(parsed.data);
  return {
    configured: true,
    allows(email: string) {
      const candidate = adminEmailSchema.safeParse(email);
      return candidate.success && allowlist.has(candidate.data);
    },
  };
}

export function readResearchRuntimePolicy(
  environment: AdminEnvironment,
): Readonly<{ enabled: boolean }> {
  return { enabled: readResearchProductionConfiguration(environment) !== null };
}
