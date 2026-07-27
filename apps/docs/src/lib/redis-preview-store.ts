import Redis from 'ioredis';
import type { PithPreviewRecord, PithPreviewStore } from '@pith-cms/next/server';

export function createRedisPreviewStore(redisUrl: string): PithPreviewStore {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  redis.on('error', () => {
    /* Suppress connection errors — read/delete degrade gracefully, create surfaces the error. */
  });

  return {
    async create(record: PithPreviewRecord): Promise<void> {
      const ttl = Math.max(Math.ceil((Date.parse(record.expiresAt) - Date.now()) / 1000), 1);
      await redis.set(`pith:preview:${record.id}`, JSON.stringify(record), 'EX', ttl);
    },

    async read(id: string): Promise<PithPreviewRecord | null> {
      try {
        const raw = await redis.get(`pith:preview:${id}`);
        if (!raw) {
          return null;
        }
        return JSON.parse(raw) as PithPreviewRecord;
      } catch {
        return null;
      }
    },

    async delete(id: string): Promise<void> {
      try {
        await redis.del(`pith:preview:${id}`);
      } catch {
        /* Best-effort — record expires naturally via TTL. */
      }
    },
  };
}
