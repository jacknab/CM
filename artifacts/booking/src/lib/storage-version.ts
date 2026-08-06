const VERSION_KEY = "certxa_schema_versions";

export const CURRENT_VERSIONS = {
  CLIENT: 1,
  QUEUE: 1,
  SYNC_PROTOCOL: 1,
  SNAPSHOT: 3,
} as const;

type StoredVersions = {
  client: number;
  queue: number;
  syncProtocol: number;
  snapshot: number;
};

type MigrationHandler = {
  fromVersion: number;
  toVersion: number;
  domain: "client" | "queue";
  run: () => Promise<void>;
};

const migrations: MigrationHandler[] = [
  // Future migrations are registered here, e.g.:
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   domain: "client",
  //   run: async () => { /* rename fields, remap IDs, etc. */ },
  // },
];

function readStoredVersions(): Partial<StoredVersions> {
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeVersions(v: StoredVersions): void {
  try {
    localStorage.setItem(VERSION_KEY, JSON.stringify(v));
  } catch {}
}

export async function checkAndRunMigrations(): Promise<{
  snapshotRefreshRequired: boolean;
  queueResetRequired: boolean;
}> {
  const stored = readStoredVersions();

  const prevClient = stored.client ?? 0;
  const prevQueue = stored.queue ?? 0;
  const prevSnapshot = stored.snapshot ?? 0;

  let snapshotRefreshRequired = false;
  let queueResetRequired = false;

  if (prevClient < CURRENT_VERSIONS.CLIENT) {
    const applicable = migrations
      .filter((m) => m.domain === "client" && m.fromVersion >= prevClient)
      .sort((a, b) => a.toVersion - b.toVersion);

    for (const m of applicable) {
      try {
        await m.run();
      } catch (err) {
        console.warn(`[migration] client ${m.fromVersion}→${m.toVersion} failed:`, err);
      }
    }
    snapshotRefreshRequired = true;
  }

  if (prevQueue < CURRENT_VERSIONS.QUEUE) {
    const applicable = migrations
      .filter((m) => m.domain === "queue" && m.fromVersion >= prevQueue)
      .sort((a, b) => a.toVersion - b.toVersion);

    for (const m of applicable) {
      try {
        await m.run();
      } catch (err) {
        console.warn(`[migration] queue ${m.fromVersion}→${m.toVersion} failed:`, err);
      }
    }
    queueResetRequired = true;
  }

  if (prevSnapshot < CURRENT_VERSIONS.SNAPSHOT) {
    snapshotRefreshRequired = true;
  }

  writeVersions({
    client: CURRENT_VERSIONS.CLIENT,
    queue: CURRENT_VERSIONS.QUEUE,
    syncProtocol: CURRENT_VERSIONS.SYNC_PROTOCOL,
    snapshot: CURRENT_VERSIONS.SNAPSHOT,
  });

  return { snapshotRefreshRequired, queueResetRequired };
}

export function getStoredVersions(): Partial<StoredVersions> {
  return readStoredVersions();
}
