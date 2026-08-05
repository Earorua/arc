type MigrationDismissalStorage = Pick<Storage, "getItem" | "setItem">;

const keyPrefix = "arc-migration-dismissal-v1:";

function resolveStorage(storage?: MigrationDismissalStorage): MigrationDismissalStorage | undefined {
  return storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
}

function keyForUser(userId: string): string {
  return `${keyPrefix}${encodeURIComponent(userId)}`;
}

export function isMigrationSnapshotAcknowledged(
  userId: string,
  fingerprint: string,
  storage?: MigrationDismissalStorage,
): boolean {
  try {
    return resolveStorage(storage)?.getItem(keyForUser(userId)) === fingerprint;
  } catch {
    return false;
  }
}

export function acknowledgeMigrationSnapshot(
  userId: string,
  fingerprint: string,
  storage?: MigrationDismissalStorage,
): boolean {
  try {
    const resolved = resolveStorage(storage);
    if (!resolved) return false;
    resolved.setItem(keyForUser(userId), fingerprint);
    return true;
  } catch {
    return false;
  }
}
