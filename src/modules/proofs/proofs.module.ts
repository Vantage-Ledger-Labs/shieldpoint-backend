import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proof } from './entities/proof.entity';
import { ProofsService } from './proofs.service';
import { ProofsController } from './proofs.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Proof])],
  controllers: [ProofsController],
  providers: [ProofsService, JwtAuthGuard],
  exports: [ProofsService],
})
export class ProofsModule {}
