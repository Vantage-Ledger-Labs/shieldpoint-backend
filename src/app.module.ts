import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProofsModule } from './modules/proofs/proofs.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
