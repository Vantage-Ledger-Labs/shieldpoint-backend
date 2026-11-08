import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  HttpCode,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ProofsService } from './proofs.service';
import {
  GetProofsQueryDto,
  ProofDto,
  ProofsListResponseDto,
  VerifyProofResponseDto,
  GenerateBalanceProofDto,
  GenerateProofResponseDto,
  WebhookStatusResponseDto,
} from './dto/proofs.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Proofs')
@ApiBearerAuth()
@Controller('proofs')
export class ProofsController {
  constructor(
    private readonly proofsService: ProofsService,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  /**
   * GET /api/v1/proofs
   * Retrieve authenticated user's proofs with pagination, filtering, and sorting
   */
  @Get()
  @ApiOperation({
    summary: 'Get user proofs with pagination and filtering',
    description:
      'Retrieve authenticated user proofs with optional filtering by status and date range, ' +
      'sorted by latest first. Response time optimized with database indexes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved proofs',
    type: ProofsListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid query parameters',
  })
  async getProofs(
    @Query() query: GetProofsQueryDto,
    @Headers('authorization') authHeader: string,
  ): Promise<ProofsListResponseDto> {
    try {
      const userId = this.jwtAuthGuard.extractUserId(authHeader);
      return await this.proofsService.getUserProofs(userId, query);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException('Invalid query parameters');
    }
  }

  /**
   * POST /api/v1/proofs/generate
   * Generate a balance proof for authenticated user
   * Rate limited: 10 requests per hour per user (Issue #9)
   */
  @Post('generate')
  @HttpCode(201)
  @Throttle({ 'proof-generation': { limit: 10, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Generate a balance proof for authenticated user',
    description:
      'Create a zero-knowledge balance proof for the authenticated user if their Stellar account balance ' +
      'meets the requested threshold. Optionally register a webhook URL for async status notification.',
  })
  @ApiResponse({
    status: 201,
    description: 'Proof generated successfully',
    type: GenerateProofResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid proof generation request or below threshold',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded (10 requests per hour per user)',
  })
  async generateProof(
    @Body() body: GenerateBalanceProofDto,
    @Headers('authorization') authHeader: string,
  ): Promise<GenerateProofResponseDto> {
    try {
      const userId = this.jwtAuthGuard.extractUserId(authHeader);
      return await this.proofsService.generateBalanceProof(
        userId,
        body.assetCode,
        body.threshold,
        body.webhook_url,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Invalid proof generation request');
    }
  }

  /**
   * GET /api/v1/proofs/:proofId
   * Retrieve a specific proof with full details
   */
  @Get(':proofId')
  @ApiOperation({
    summary: 'Get proof details by ID',
    description:
      'Retrieve a specific proof with full details including verification transaction hash ' +
      'and computed explorer link. Users can only access their own proofs.',
  })
  @ApiParam({
    name: 'proofId',
    description: 'The proof ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved proof details',
    type: ProofDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 404,
    description: 'Proof not found',
  })
  async getProofById(
    @Param('proofId') proofId: string,
    @Headers('authorization') authHeader: string,
  ): Promise<ProofDto> {
    try {
      const userId = this.jwtAuthGuard.extractUserId(authHeader);

      const proof = await this.proofsService.getProofById(proofId, userId);
      if (!proof) {
        throw new NotFoundException('Proof not found');
      }

      return proof;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Invalid proof ID format');
    }
  }

  /**
   * POST /api/v1/proofs/:proofId/verify
   * Verify a proof on-chain and trigger webhook callback if configured (Issue #7)
   */
  @Post(':proofId/verify')
  @ApiOperation({
    summary: 'Verify a proof on-chain',
    description:
      'Submit a generated proof to the Soroban Verifier contract and wait for on-chain confirmation. ' +
      'Updates the proof status and asynchronously dispatches webhook callback if registered.',
  })
  @ApiParam({
    name: 'proofId',
    description: 'The proof ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Proof verification result',
    type: VerifyProofResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Proof already verified, expired, or invalid',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 404,
    description: 'Proof not found',
  })
  async verifyProof(
    @Param('proofId') proofId: string,
    @Headers('authorization') authHeader: string,
  ): Promise<VerifyProofResponseDto> {
    try {
      const userId = this.jwtAuthGuard.extractUserId(authHeader);
      return await this.proofsService.verifyProof(proofId, userId);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new BadRequestException('Unable to verify proof');
    }
  }

  /**
   * GET /api/v1/proofs/:proofId/webhook-status
   * Retrieve webhook delivery attempts and status (Issue #7)
   */
  @Get(':proofId/webhook-status')
  @ApiOperation({
    summary: 'Get webhook delivery status for a proof',
    description: 'Retrieve webhook delivery status and delivery attempts for the specified proof.',
  })
  @ApiParam({
    name: 'proofId',
    description: 'The proof ID (UUID)',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook delivery status retrieved successfully',
    type: WebhookStatusResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 404,
    description: 'Proof not found',
  })
  async getWebhookStatus(
    @Param('proofId') proofId: string,
    @Headers('authorization') authHeader: string,
  ): Promise<WebhookStatusResponseDto> {
    try {
      const userId = this.jwtAuthGuard.extractUserId(authHeader);
      return await this.proofsService.getWebhookStatus(proofId, userId);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Invalid proof ID');
    }
  }
}
