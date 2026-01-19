import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';

function buildRedisOptions(): RedisOptions {
  const redisUrl = (process.env.REDIS_URL || '').trim();

  // общие опции, критичные для BullMQ
  const common: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  if (redisUrl) {
    const u = new URL(redisUrl);

    const isTls = u.protocol === 'rediss:';
    const port = u.port ? Number(u.port) : isTls ? 6380 : 6379;

    const dbFromPath = (u.pathname || '').replace('/', '');
    const db = dbFromPath ? Number(dbFromPath) : undefined;

    return {
      ...common,
      host: u.hostname,
      port,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: Number.isFinite(db as any) ? db : undefined,
      tls: isTls ? {} : undefined,
    };
  }

  // fallback на host/port
  return {
    ...common,
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT || 6379),
    password: (process.env.REDIS_PASSWORD || '').trim() || undefined,
    db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : undefined,
  };
}

@Injectable()
export class QueueService {
  public readonly connectionOptions: RedisOptions;
  public readonly connection: IORedis;
  public readonly campaignQueue: Queue;

  constructor() {
    this.connectionOptions = buildRedisOptions();

    this.connection = new IORedis(this.connectionOptions);

    // чтобы не было "Unhandled error event" и было видно причину
    this.connection.on('error', (e) => {
      console.warn('[Redis] error:', (e as any)?.message ?? e);
    });
    this.connection.on('connect', () => {
      console.log(
        `[Redis] connected to ${this.connectionOptions.host}:${this.connectionOptions.port}`,
      );
    });

    this.campaignQueue = new Queue('campaign-send', {
      connection: this.connectionOptions,
    });
  }
}
