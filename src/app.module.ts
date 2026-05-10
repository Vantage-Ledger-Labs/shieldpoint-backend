import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProofsModule } from './modules/proofs/proofs.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { HealthModule } from './modules/health/health.module';
import { getTypeOrmConfig } from './config/typeorm.config';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    ProofsModule,
    StellarModule,
    PrismaModule

  ],
})
export class AppModule {}
