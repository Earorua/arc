import { createHash } from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
export const sameSet = (left, right) => new Set(left).size === left.length && new Set(right).size === right.length && equal([...left].sort(), [...right].sort());
export const fieldId = (field) => field.legacyId ?? field.id;
export const sourceKey = ({ segmentId, quote }) => JSON.stringify([segmentId, quote]);
export const reviewKey = ({ code, source }) => JSON.stringify([code, source.segmentId, source.quote]);
export const observationKey = (documentId, candidateId, literal) => JSON.stringify([documentId, candidateId, literal]);
export const metric = (numerator, denominator) => ({ status: denominator ? "evaluated" : "not-applicable", numerator, denominator, value: denominator ? numerator / denominator : null });
export function deepFreeze(value) {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}
export function errorCollector(limit = 200) {
  const errors = []; let omitted = 0;
  return { errors, add(code, location = {}) { if (errors.length < limit) errors.push({ code, ...location }); else omitted++; }, get omitted() { return omitted; } };
}
export const fixedDenominators = Object.freeze({ documents: 30, legacyFields: 84, additionalFields: 2, primaryJdExplicitClassification: 31, secondaryJdExplicitClassification: 1, unresolvedJdConflictAnchors: 2, planningCases: 14 });
