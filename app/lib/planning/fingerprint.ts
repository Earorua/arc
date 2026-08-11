const FNV_PRIME = 0x01000193;
const FNV_SEEDS = [0x811c9dc5, 0x811c9dc7, 0x811c9dc9, 0x811c9dcb] as const;
const ID_PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RUNTIME_METADATA_KEYS = new Set([
  "createdAt", "updatedAt", "requestId", "mutationId", "eventId", "sequence", "occurredAt",
]);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function invalidJson(): never {
  throw new TypeError("Value must be plain JSON");
}

function hasExpectedPrototype(value: object, prototype: object): boolean {
  try {
    return Object.getPrototypeOf(value) === prototype;
  } catch {
    invalidJson();
  }
}

function ownDescriptorSnapshot(value: object): Record<PropertyKey, PropertyDescriptor> {
  // A proxy descriptor trap is allowed to fail validation, but never exposes its own error.
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return invalidJson();
  }
}

function sortedObjectEntries(value: object): [string, unknown][] {
  if (!hasExpectedPrototype(value, Object.prototype)) invalidJson();
  const descriptors = ownDescriptorSnapshot(value);
  if (Object.getOwnPropertySymbols(descriptors).length > 0) invalidJson();

  const entries: [string, unknown][] = [];
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    const descriptor = descriptors[key]!;
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalidJson();
    entries.push([key, descriptor.value]);
  }
  return entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
}

function arrayValues(value: unknown[]): unknown[] {
  if (!hasExpectedPrototype(value, Array.prototype)) invalidJson();
  const descriptors = ownDescriptorSnapshot(value);
  if (Object.getOwnPropertySymbols(descriptors).length > 0) invalidJson();
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    invalidJson();
  }
  const length = lengthDescriptor.value;
  const names = Object.getOwnPropertyNames(descriptors);
  if (names.length !== length + 1) invalidJson();

  const values: [number, unknown][] = [];
  for (const name of names) {
    if (name === "length") continue;
    const index = Number(name);
    const descriptor = descriptors[name]!;
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== name
      || !descriptor.enumerable || !("value" in descriptor)) invalidJson();
    values.push([index, descriptor.value]);
  }
  return values.sort(([left], [right]) => left - right).map(([, item]) => item);
}

function serialize(value: unknown, stack: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidJson();
    return JSON.stringify(value);
  }
  if (typeof value !== "object") invalidJson();
  if (stack.has(value)) invalidJson();

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${arrayValues(value).map((item) => serialize(item, stack)).join(",")}]`;
    }
    return `{${sortedObjectEntries(value).map(([key, item]) => `${JSON.stringify(key)}:${serialize(item, stack)}`).join(",")}}`;
  } finally {
    stack.delete(value);
  }
}

function copyWithoutRuntimeMetadata(value: unknown, stack: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidJson();
    return value;
  }
  if (typeof value !== "object") invalidJson();
  if (stack.has(value)) invalidJson();

  stack.add(value);
  try {
    if (Array.isArray(value)) return arrayValues(value).map((item) => copyWithoutRuntimeMetadata(item, stack));

    const copy: { [key: string]: JsonValue } = {};
    for (const [key, item] of sortedObjectEntries(value)) {
      if (!RUNTIME_METADATA_KEYS.has(key)) {
        Object.defineProperty(copy, key, {
          value: copyWithoutRuntimeMetadata(item, stack),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return copy;
  } finally {
    stack.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

export function fingerprint(value: unknown): string {
  const canonical = canonicalJson(copyWithoutRuntimeMetadata(value, new Set()));
  const lanes: number[] = [...FNV_SEEDS];
  for (let index = 0; index < canonical.length; index += 1) {
    const codeUnit = canonical.charCodeAt(index);
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] = Math.imul(lanes[lane]! ^ codeUnit, FNV_PRIME) >>> 0;
    }
  }
  return `p2-${lanes.map((lane) => lane.toString(16).padStart(8, "0")).join("")}`;
}

export function deterministicId(prefix: string, value: unknown): string {
  if (!ID_PREFIX.test(prefix) || prefix.length > 223) throw new TypeError("Invalid deterministic ID prefix");
  return `${prefix}-${fingerprint(value).slice(3)}`;
}
