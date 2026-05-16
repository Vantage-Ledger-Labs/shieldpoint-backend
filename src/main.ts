import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaService } from './database/prisma.service';
import { MetricsService } from './common/metrics/metrics.service';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

async function bootstrap() {
  const logger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format:
          process.env.NODE_ENV === 'production'
            ? winston.format.combine(winston.format.timestamp(), winston.format.json())
            : winston.format.combine(
                winston.format.colorize({ all: true }),
                winston.format.timestamp(),
                winston.format.prettyPrint(),
              ),
      }),
    ],
  });

  const app = await NestFactory.create(AppModule, { logger });
  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);
  const metricsService = app.get(MetricsService);

  await prismaService.enableShutdownHooks(app);

  // Global prefix for API versioning
  app.setGlobalPrefix('api/v1');

  // Request ID tracking
  app.use(requestIdMiddleware);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptor for logging and metrics
  app.useGlobalInterceptors(new LoggingInterceptor(metricsService));

  // Enable CORS
  app.enableCors();

  // Swagger/OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('Shieldpoint API')
    .setDescription(
      'Shieldpoint Backend API - Stellar-based proof verification platform. All endpoints require JWT authentication.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'access-token',
    )
    .addTag('Health', 'Health check endpoints')
    .addTag('Proofs', 'Proof verification and history endpoints')
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Stellar', 'Stellar blockchain integration endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customCss:
      '.topbar { display: none; } .swagger-ui .topbar { display: block; } .swagger-ui .info { margin: 20px 0; }',
  });

  const port = configService.get<number>('PORT') || 3001;
  const server = await app.listen(port);
  metricsService.trackConnections(app.getHttpServer());

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation available at: http://localhost:${port}/api/docs`);
}

bootstrap();
