import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app.config';
import { AppConfigModule } from '../config/config.module';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) public readonly client: Redis) {}

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Redis ready');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }
    this.logger.log('Redis disconnected');
  }
}

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis => {
        const client = new Redis(config.get('REDIS_URL'), {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          enableReadyCheck: true,
        });
        const logger = new Logger('RedisClient');
        client.on('error', (err: Error) => logger.error(`redis error: ${err.message}`, err.stack));
        client.on('connect', () => logger.log('redis connected'));
        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
