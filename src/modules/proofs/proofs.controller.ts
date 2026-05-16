import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { ProofsService } from './proofs.service';
import {
  GetProofsQueryDto,
  ProofDto,
  ProofsListResponseDto,
  VerifyProofResponseDto,
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
   *
   * Query Parameters:
   * - page: Page number (default: 1)
   * - limit: Records per page, max 100 (default: 20)
   * - status: Filter by status (pending, verified, failed)
   * - fromDate: Filter from date (ISO 8601)
   * - toDate: Filter to date (ISO 8601)
   *
   * Response:
   * - data: Array of Proof objects
   * - total: Total number of records
   * - page: Current page
   * - totalPages: Total number of pages
   *
   * Performance:
   * - Indexed on (user_id, created_at DESC) for <200ms response with 10k records
   * - Sorted by latest first (created_at DESC) by default
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
   * GET /api/v1/proofs/:proofId
   * Retrieve a specific proof with full details
   *
   * Parameters:
   * - proofId: The ID of the proof (UUID)
   *
   * Response:
   * - Proof object with all details including transaction hash
   * - explorer_link: Computed field with link to Stellar explorer for transaction
   *
   * Security:
   * - Users can only access their own proofs
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

  @Post(':proofId/verify')
  @ApiOperation({
    summary: 'Verify a proof on-chain',
    description:
      'Submit a generated proof to the Soroban Verifier contract and wait for on-chain confirmation. ' +
      'Updates the proof status and returns the transaction hash and explorer link.',
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
}
