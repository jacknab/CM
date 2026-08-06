/**
 * Redis client — ioredis with graceful degradation.
 *
 * If Redis is not configured or the connection fails the rest of the
 * application keeps running; availability data falls back to live DB queries.
 */

import Redis from "ioredis";

let _client: Redis | null = null;
let _available = false;

interface RedisResolvedConfig {
  url: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

function resolveRedisConfig(): RedisResolvedConfig | null {
  if (String(process.env.REDIS_DISABLED ?? "").trim() === "1") {
    return null;
  }

  const redisUrl = (process.env.REDIS_URL ?? "").trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const host = parsed.hostname || "127.0.0.1";
      const port = Number(parsed.port || "6379") || 6379;
      const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
      const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      const dbPath = parsed.pathname?.replace(/^\//, "").trim();
      const db = dbPath ? Number(dbPath) : undefined;

      return {
        url: redisUrl,
        host,
        port,
        username,
        password,
        db: Number.isFinite(db) ? db : undefined,
        tls: parsed.protocol === "rediss:" ? {} : undefined,
      };
    } catch {
      // fall through to host/port resolution
    }
  }

  const host = (process.env.REDIS_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(process.env.REDIS_PORT ?? "6379") || 6379;
  const username = (process.env.REDIS_USERNAME ?? "").trim() || undefined;
  const password = (process.env.REDIS_PASSWORD ?? "").trim() || undefined;
  const dbRaw = (process.env.REDIS_DB ?? "").trim();
  const db = dbRaw ? Number(dbRaw) : undefined;

  const authPart = password
    ? `${username ? `${encodeURIComponent(username)}:` : ""}${encodeURIComponent(password)}@`
    : "";
  const dbPart = Number.isFinite(db) ? `/${db}` : "";

  return {
    url: `redis://${authPart}${host}:${port}${dbPart}`,
    host,
    port,
    username,
    password,
    db: Number.isFinite(db) ? db : undefined,
  };
}

function buildClient(): Redis {
  const resolved = resolveRedisConfig();
  const url = resolved?.url ?? "redis://127.0.0.1:6379";

  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 5000,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 500, 2000);
    },
  });

  client.on("connect", () => {
    _available = true;
    console.log("[Redis] Connected");
  });

  client.on("ready", () => {
    _available = true;
  });

  client.on("error", (err) => {
    if (_available) {
      console.warn("[Redis] Connection error — availability cache will fall back to DB:", err.message);
    }
    _available = false;
  });

  client.on("close", () => {
    _available = false;
  });

  return client;
}

export function getRedisClient(): Redis | null {
  if (!_client) {
    const resolved = resolveRedisConfig();
    if (!resolved) {
      return null;
    }
    _client = buildClient();
  }
  return _client;
}

export function isRedisAvailable(): boolean {
  return _available && _client !== null;
}

export function closeRedisClient(): Promise<void> {
  if (_client) {
    return _client.quit().then(() => {
      _client = null;
      _available = false;
    });
  }
  return Promise.resolve();
}

/**
 * BullMQ connection options derived from the same Redis environment settings.
 * Using plain options avoids cross-version ioredis type incompatibilities.
 */
export function getBullMqConnectionOptions(): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
} | null {
  const resolved = resolveRedisConfig();
  if (!resolved) return null;
  return {
    host: resolved.host,
    port: resolved.port,
    username: resolved.username,
    password: resolved.password,
    db: resolved.db,
    tls: resolved.tls,
  };
}
