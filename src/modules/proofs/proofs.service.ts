import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import { Proof, ProofStatus } from './entities/proof.entity';
import {
  GetProofsQueryDto,
  ProofDto,
  ProofsListResponseDto,
  GenerateProofResponseDto,
} from './dto/proofs.dto';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { StellarService } from '../stellar/stellar.service';
import { ProofGenerationQueueService } from './proof-generation.queue';

interface MockProofResult {
  proofData: string;
  publicInputs: Record<string, any>;
  commitmentHash: string;
  assetCode: string;
  threshold: number;
  balance: number;
  userId: string;
  proofId: string;
}

@Injectable()
export class ProofsService {
  constructor(
    @InjectRepository(Proof)
    private readonly proofRepository: Repository<Proof>,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly stellarService: StellarService,
    private readonly proofQueueService: ProofGenerationQueueService,
  ) {}

  async getUserProofs(
    userId: string,
    query: GetProofsQueryDto,
  ): Promise<ProofsListResponseDto> {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.max(Math.min(query.limit || 20, 100), 1);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Proof> = {
      userId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      const fromDate = query.fromDate ? new Date(query.fromDate) : new Date('1970-01-01');
      const toDate = query.toDate ? new Date(query.toDate) : new Date();

      where.createdAt = Between(fromDate, toDate);
    }

    const [proofs, total] = await this.proofRepository.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      skip,
      take: limit,
    });

    return {
      data: proofs.map((proof) => this.transformToDto(proof)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getProofById(proofId: string, userId: string): Promise<ProofDto> {
    const proof = await this.proofRepository.findOne({
      where: {
        id: proofId,
        userId,
      },
    });

    return proof ? this.transformToDto(proof) : null;
  }

  async generateBalanceProof(
    userId: string,
    assetCode: string,
    threshold: number,
  ): Promise<GenerateProofResponseDto> {
    const user = await this.usersService.getUserById(userId);
    if (!user.stellarAccountId) {
      throw new BadRequestException('User Stellar account is not configured');
    }

    let balance: number;
    try {
      balance = await this.stellarService.getBalance(user.stellarAccountId, assetCode);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(error?.message || 'Failed to fetch Stellar balance');
    }

    if (balance < threshold) {
      throw new BadRequestException(
        `Balance ${balance} is below the requested threshold of ${threshold}`,
      );
    }

    const proofPayload = this.createMockProof(userId, assetCode, threshold, balance);
    const proof = await this.saveProofRecord(userId, proofPayload);

    await this.proofQueueService.enqueueProofJob({
      proofId: proof.id,
      userId,
      assetCode,
      threshold,
      balance,
      commitmentHash: proofPayload.commitmentHash,
    });

    return {
      proofId: proof.id,
      proofData: proofPayload.proofData,
      publicInputs: proofPayload.publicInputs,
      commitmentHash: proofPayload.commitmentHash,
    };
  }

  async createProof(
    userId: string,
    proofData: string,
    metadata?: Record<string, any>,
  ): Promise<ProofDto> {
    const proof = this.proofRepository.create({
      userId,
      proofData,
      metadata,
      status: ProofStatus.PENDING,
    });

    const savedProof = await this.proofRepository.save(proof);
    return this.transformToDto(savedProof);
  }

  async updateProofVerified(
    proofId: string,
    transactionHash: string,
    metadata?: Record<string, any>,
  ): Promise<ProofDto> {
    const proof = await this.proofRepository.findOne({
      where: { id: proofId },
    });

    if (!proof) {
      return null;
    }

    proof.status = ProofStatus.VERIFIED;
    proof.transactionHash = transactionHash;
    proof.verifiedAt = new Date();

    if (metadata) {
      proof.metadata = { ...proof.metadata, ...metadata };
    }

    const updatedProof = await this.proofRepository.save(proof);
    return this.transformToDto(updatedProof);
  }

  async updateProofFailed(
    proofId: string,
    errorMessage: string,
  ): Promise<ProofDto> {
    const proof = await this.proofRepository.findOne({
      where: { id: proofId },
    });

    if (!proof) {
      return null;
    }

    proof.status = ProofStatus.FAILED;
    proof.errorMessage = errorMessage;

    const updatedProof = await this.proofRepository.save(proof);
    return this.transformToDto(updatedProof);
  }

  private async saveProofRecord(userId: string, proofPayload: MockProofResult): Promise<Proof> {
    const proof = this.proofRepository.create({
      userId,
      proofData: proofPayload.proofData,
      status: ProofStatus.GENERATED,
      metadata: {
        assetCode: proofPayload.assetCode,
        threshold: proofPayload.threshold,
        balance: proofPayload.balance,
        publicInputs: proofPayload.publicInputs,
        commitmentHash: proofPayload.commitmentHash,
      },
    });

    return await this.proofRepository.save(proof);
  }

  private createMockProof(
    userId: string,
    assetCode: string,
    threshold: number,
    balance: number,
  ): MockProofResult {
    const proofId = randomUUID();
    const publicInputs = {
      assetCode,
      threshold,
      balance,
    };
    const commitmentHash = createHash('sha256')
      .update(`${userId}|${assetCode}|${threshold}|${balance}|${Date.now()}`)
      .digest('hex');

    const proofData = JSON.stringify({
      proofId,
      assetCode,
      threshold,
      balance,
      publicInputs,
      commitmentHash,
      createdAt: new Date().toISOString(),
    });

    return {
      proofId,
      proofData,
      publicInputs,
      commitmentHash,
      assetCode,
      threshold,
      balance,
      userId,
    };
  }

  private transformToDto(proof: Proof): ProofDto {
    const explorerLink = this.getExplorerLink(proof.transactionHash);

    return {
      id: proof.id,
      userId: proof.userId,
      status: proof.status,
      proofData: proof.proofData,
      transactionHash: proof.transactionHash,
      explorer_link: explorerLink,
      errorMessage: proof.errorMessage,
      metadata: proof.metadata,
      createdAt: proof.createdAt,
      updatedAt: proof.updatedAt,
      verifiedAt: proof.verifiedAt,
    };
  }

  private getExplorerLink(transactionHash: string | null): string | null {
    if (!transactionHash) {
      return null;
    }

    const network = this.configService.get('STELLAR_NETWORK', 'testnet');
    const explorerBase =
      network === 'mainnet' ? 'https://stellar.expert/explorer/mainnet' : 'https://stellar.expert/explorer/testnet';

    return `${explorerBase}/tx/${transactionHash}`;
  }
}
