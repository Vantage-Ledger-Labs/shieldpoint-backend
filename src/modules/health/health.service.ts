import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly metricsService: MetricsService,
  ) {}

  async getHealth() {
    const result: any = {
      status: 'ok',
      checks: {
        database: { status: 'unknown' },
        stellarRpc: { status: 'unknown' },
      },
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      result.checks.database = { status: 'up' as const };
    } catch (error) {
      result.checks.database = {
        status: 'down' as const,
        error: (error as Error).message,
      };
    }

    try {
      const stellarStatus = await this.stellarService.checkRpcHealth();
      result.checks.stellarRpc = {
        status: 'up' as const,
        network: stellarStatus.network,
        rpcUrl: stellarStatus.rpcUrl,
      };
    } catch (error) {
      result.checks.stellarRpc = {
        status: 'down' as const,
        error: (error as Error).message,
      };
    }

    if (result.checks.database.status === 'down' || result.checks.stellarRpc.status === 'down') {
      return {
        ...result,
        status: 'degraded',
      };
    }

    return result;
  }

  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  getMetricsContentType(): string {
    return this.metricsService.getContentType();
  }
}
