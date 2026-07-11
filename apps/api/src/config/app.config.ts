import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import type { EnvVars } from './env.schema';

@Injectable()
export class AppConfig {
  constructor(private readonly nest: NestConfigService<EnvVars, true>) {}

  get<K extends keyof EnvVars>(key: K): EnvVars[K] {
    return this.nest.get(key, { infer: true }) as EnvVars[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }

  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }
}
