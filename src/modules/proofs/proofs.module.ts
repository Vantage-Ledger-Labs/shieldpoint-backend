import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proof } from './entities/proof.entity';
import { ProofsService } from './proofs.service';
import { ProofsController } from './proofs.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { StellarModule } from '../stellar/stellar.module';
import { ProofGenerationQueueService } from './proof-generation.queue';
import { WebhookService } from './webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([Proof]), UsersModule, StellarModule],
  controllers: [ProofsController],
  providers: [ProofsService, JwtAuthGuard, ProofGenerationQueueService, WebhookService],
  exports: [ProofsService, WebhookService],
})
export class ProofsModule {}
