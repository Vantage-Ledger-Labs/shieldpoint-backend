import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip } = request;
    const userAgent = request.get('User-Agent') || '';
    const requestId = request.headers['x-request-id'] || (request as any).requestId || 'unknown';
    const userId = request.user?.userId || request.user?.id || 'anonymous';
    const routePath = request.route?.path || request.path || url;
    const startTime = Date.now();

    this.logger.log(
      JSON.stringify({
        event: 'request_incoming',
        requestId,
        method,
        path: routePath,
        url,
        ip,
        userAgent,
        userId,
      }),
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const duration = Date.now() - startTime;
          this.metricsService.recordHttpRequest(method, routePath, statusCode);

          if (routePath.includes('/proofs')) {
            this.metricsService.recordProofDuration(duration / 1000, method, routePath);
          }

          if (duration > 1000) {
            this.logger.warn(
              JSON.stringify({
                event: 'slow_request',
                requestId,
                method,
                path: routePath,
                statusCode,
                duration,
                userId,
              }),
            );
          }

          if (this.metricsService.isErrorRateHigh()) {
            this.logger.warn(
              JSON.stringify({
                event: 'high_error_rate',
                requestId,
                totalRequests: this.metricsService.getTotalRequests(),
                errorRequests: this.metricsService.getErrorRequests(),
                errorRate: this.metricsService.getErrorRate(),
              }),
            );
          }

          this.logger.log(
            JSON.stringify({
              event: 'request_completed',
              requestId,
              method,
              path: routePath,
              statusCode,
              duration,
              userId,
            }),
          );
        },
        error: (error) => {
          const statusCode = response.statusCode || 500;
          const duration = Date.now() - startTime;
          this.metricsService.recordHttpRequest(method, routePath, statusCode);
          this.logger.error(
            JSON.stringify({
              event: 'request_error',
              requestId,
              method,
              path: routePath,
              statusCode,
              duration,
              userId,
              message: error?.message,
              stack: error?.stack,
            }),
          );
        },
      }),
    );
  }
}
