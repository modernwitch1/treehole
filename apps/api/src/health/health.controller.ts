import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness probe. 永远 200 除非进程死了。
   */
  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  async live() {
    return this.health.checkLiveness();
  }

  /**
   * Readiness probe. DB + Redis 都通才返回 200, 否则 503。
   */
  @Get('readyz')
  async ready(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.checkReadiness();
    res.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
