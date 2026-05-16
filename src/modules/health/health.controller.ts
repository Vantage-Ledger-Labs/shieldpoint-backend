import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async getHealth() {
    return this.healthService.getHealth();
  }

  @Get('metrics')
  async getMetrics(@Res() res: Response) {
    const metrics = await this.healthService.getMetrics();
    const contentType = this.healthService.getMetricsContentType();
    res.setHeader('Content-Type', contentType);
    res.send(metrics);
  }
}
