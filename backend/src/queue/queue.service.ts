import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';

@Injectable()
export class QueueService {
  public readonly connectionOptions: RedisOptions;
  public readonly connection: IORedis;
  public readonly campaignQueue: Queue;

  constructor() {
    this.connectionOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),

      // ❗ критично для BullMQ (исправляет ошибку maxRetriesPerRequest)
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };

    this.connection = new IORedis(this.connectionOptions);

    // Queue лучше создавать с options (а не с экземпляром соединения)
    this.campaignQueue = new Queue('campaign-send', {
      connection: this.connectionOptions,
    });
  }
}
