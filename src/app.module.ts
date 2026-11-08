import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProofsModule } from './modules/proofs/proofs.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { HealthModule } from './modules/health/health.module';
import { getTypeOrmConfig } from './config/typeorm.config';
import { PrismaModule } from './database/prisma.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'default',
          ttl: configService.get<number>('THROTTLE_TTL', 60000), // 1 minute
          limit: configService.get<number>('THROTTLE_LIMIT', 100), // 100 requests per minute per IP
        },
        {
          name: 'auth',
          ttl: 60000, // 1 minute
          limit: 5, // 5 requests per minute per IP
        },
        {
          name: 'proof-generation',
          ttl: 3600000, // 1 hour
          limit: 10, // 10 requests per hour per user
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    MetricsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProofsModule,
    StellarModule,
    PrismaModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
