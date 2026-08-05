import { beforeEach, describe, expect, it } from "vitest";
import {
  acknowledgeMigrationSnapshot,
  isMigrationSnapshotAcknowledged,
} from "../../app/lib/migration-dismissal";

beforeEach(() => window.localStorage.clear());

describe("migration dismissal", () => {
  it("acknowledges one snapshot for one Arc user only", () => {
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-a")).toBe(false);
    expect(acknowledgeMigrationSnapshot("user-a", "v1-state-a")).toBe(true);
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-a")).toBe(true);
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-b")).toBe(false);
    expect(isMigrationSnapshotAcknowledged("user-b", "v1-state-a")).toBe(false);
  });

  it("fails open when browser storage is unavailable", () => {
    const unavailable = {
      getItem(): string | null {
        throw new Error("unavailable");
      },
      setItem(): void {
        throw new Error("unavailable");
      },
    };

    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-a", unavailable)).toBe(false);
    expect(acknowledgeMigrationSnapshot("user-a", "v1-state-a", unavailable)).toBe(false);
  });
});
