import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { Proof, ProofStatus } from './entities/proof.entity';
import { GetProofsQueryDto, ProofDto, ProofsListResponseDto } from './dto/proofs.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProofsService {
  constructor(
    @InjectRepository(Proof)
    private proofRepository: Repository<Proof>,
    private configService: ConfigService,
  ) {}

  /**
   * Get user's proofs with pagination, filtering, and sorting
   * Sorted by latest first (createdAt DESC)
   * Response time optimized with database indexes on (user_id, created_at)
   */
  async getUserProofs(
    userId: string,
    query: GetProofsQueryDto,
  ): Promise<ProofsListResponseDto> {
    // Parse pagination parameters
    const page = Math.max(query.page || 1, 1);
    const limit = Math.max(Math.min(query.limit || 20, 100), 1);
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: FindOptionsWhere<Proof> = {
      userId,
    };

    // Filter by status if provided
    if (query.status) {
      where.status = query.status;
    }

    // Filter by date range if provided
    if (query.fromDate || query.toDate) {
      const fromDate = query.fromDate ? new Date(query.fromDate) : new Date('1970-01-01');
      const toDate = query.toDate ? new Date(query.toDate) : new Date();

      where.createdAt = Between(fromDate, toDate);
    }

    // Execute query with sorting and pagination
    // Using index on (user_id, created_at DESC) for optimal performance
    const [proofs, total] = await this.proofRepository.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      skip,
      take: limit,
    });

    // Transform to DTOs with computed fields
    const data = proofs.map((proof) => this.transformToDto(proof));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      totalPages,
    };
  }

  /**
   * Get a single proof by ID with full details
   * Includes verification transaction hash and explorer link
   */
  async getProofById(proofId: string, userId: string): Promise<ProofDto> {
    const proof = await this.proofRepository.findOne({
      where: {
        id: proofId,
        userId, // Ensure user can only access their own proofs
      },
    });

    if (!proof) {
      return null;
    }

    return this.transformToDto(proof);
  }

  /**
   * Create a new proof record
   */
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

  /**
   * Update proof status and transaction hash when verified
   */
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

  /**
   * Mark proof as failed with error message
   */
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

  /**
   * Transform Proof entity to DTO with computed fields
   */
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

  /**
   * Generate explorer link for Stellar transaction
   */
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
