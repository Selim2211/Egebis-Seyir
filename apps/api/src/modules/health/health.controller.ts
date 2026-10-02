import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@scrum/shared';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../auth/decorators';
import { HealthResponseDto } from './health.dto';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Uygulama ve veritabanı durumu. Veritabanı yoksa 503 döner (load balancer/docker healthcheck için). */
  @Get()
  @ZodResponse({ type: HealthResponseDto })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
