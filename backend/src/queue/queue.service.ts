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
      	host: process.env.REDIS_URL ? undefined : (process.env.REDIS_HOST || "redis"),
	port: process.env.REDIS_URL ? undefined : Number(process.env.REDIS_PORT || 6379),
	...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : {}),


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
