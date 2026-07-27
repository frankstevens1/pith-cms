import Redis from 'ioredis';
import type { PithPreviewRecord, PithPreviewStore } from '@pith-cms/next/server';

export function createRedisPreviewStore(redisUrl: string): PithPreviewStore {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  return {
    async create(record: PithPreviewRecord): Promise<void> {
      const ttl = Math.max(Math.ceil((Date.parse(record.expiresAt) - Date.now()) / 1000), 1);
      await redis.set(`pith:preview:${record.id}`, JSON.stringify(record), 'EX', ttl);
    },

    async read(id: string): Promise<PithPreviewRecord | null> {
      const raw = await redis.get(`pith:preview:${id}`);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as PithPreviewRecord;
    },

    async delete(id: string): Promise<void> {
      await redis.del(`pith:preview:${id}`);
    },
  };
}
