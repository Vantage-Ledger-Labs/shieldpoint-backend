import { Injectable, Logger } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { Server } from 'http';
import type { Socket } from 'net';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();
  private readonly httpRequestCounter: Counter<string>;
  private readonly proofDurationHistogram: Histogram<string>;
  private readonly stellarRpcErrorsCounter: Counter<string>;
  private readonly activeConnectionsGauge: Gauge<string>;
  private readonly connections = new Set<Socket>();
  private totalRequests = 0;
  private errorRequests = 0;

  constructor() {
    this.httpRequestCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'] as const,
      registers: [this.registry],
    });

    this.proofDurationHistogram = new Histogram({
      name: 'proof_generation_duration_seconds',
      help: 'Proof generation duration in seconds',
      labelNames: ['method', 'path'] as const,
      buckets: [0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.stellarRpcErrorsCounter = new Counter({
      name: 'stellar_rpc_errors_total',
      help: 'Total number of Stellar RPC errors',
      registers: [this.registry],
    });

    this.activeConnectionsGauge = new Gauge({
      name: 'active_connections',
      help: 'Number of active HTTP connections',
      registers: [this.registry],
    });

    this.registry.setDefaultLabels({ service: 'shieldpoint-backend' });
  }

  recordHttpRequest(method: string, path: string, status: number): void {
    const safePath = path || 'unknown';
    this.totalRequests += 1;
    if (status >= 500) {
      this.errorRequests += 1;
    }
    this.httpRequestCounter.inc({ method, path: safePath, status: status.toString() });
  }

  recordProofDuration(durationSeconds: number, method: string, path: string): void {
    this.proofDurationHistogram.observe({ method, path: path || 'unknown' }, durationSeconds);
  }

  recordStellarRpcError(): void {
    this.stellarRpcErrorsCounter.inc();
  }

  trackConnections(server: Server): void {
    server.on('connection', (socket) => {
      this.connections.add(socket);
      this.activeConnectionsGauge.set(this.connections.size);
      socket.on('close', () => {
        this.connections.delete(socket);
        this.activeConnectionsGauge.set(this.connections.size);
      });
    });
  }

  getErrorRate(): number {
    if (this.totalRequests === 0) {
      return 0;
    }
    return this.errorRequests / this.totalRequests;
  }

  getTotalRequests(): number {
    return this.totalRequests;
  }

  getErrorRequests(): number {
    return this.errorRequests;
  }

  isErrorRateHigh(threshold = 0.05): boolean {
    return this.getErrorRate() > threshold;
  }

  async getMetrics(): Promise<string> {
    try {
      return await this.registry.metrics();
    } catch (error) {
      this.logger.error('Unable to collect Prometheus metrics', error as Error);
      return '';
    }
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
