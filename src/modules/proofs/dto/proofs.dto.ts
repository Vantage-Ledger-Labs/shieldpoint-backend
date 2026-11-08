import {
  IsEnum,
  IsOptional,
  IsDateString,
  Min,
  Max,
  IsNumber,
  IsString,
  Matches,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProofStatus } from '../entities/proof.entity';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class GetProofsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @IsNumber()
  page: number = 1;

  @ApiPropertyOptional({ description: 'Number of records per page', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsNumber()
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by proof status',
    enum: ProofStatus,
  })
  @IsOptional()
  @IsEnum(ProofStatus)
  status?: ProofStatus;

  @ApiPropertyOptional({
    description: 'Filter proofs created from this date (ISO 8601)',
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter proofs created until this date (ISO 8601)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class ProofDto {
  @ApiProperty({ description: 'Proof ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Proof status', enum: ProofStatus })
  status: ProofStatus;

  @ApiProperty({ description: 'Proof data' })
  proofData: string;

  @ApiProperty({ description: 'Transaction hash (if verified)' })
  transactionHash: string | null;

  @ApiProperty({ description: 'Explorer link for transaction hash' })
  explorer_link: string | null;

  @ApiProperty({ description: 'Error message if proof failed' })
  errorMessage: string | null;

  @ApiProperty({ description: 'Metadata' })
  metadata: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Webhook callback URL' })
  webhook_url?: string | null;

  @ApiPropertyOptional({ description: 'When webhook was successfully delivered' })
  webhook_sent_at?: Date | null;

  @ApiProperty({ description: 'Proof created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Proof updated at' })
  updatedAt: Date;

  @ApiProperty({ description: 'When proof was verified' })
  verifiedAt: Date | null;
}

export class VerifyProofResponseDto {
  @ApiProperty({ description: 'Verification success indicator', example: true })
  success: boolean;

  @ApiProperty({ description: 'Stellar transaction hash', example: 'abcdef123456' })
  txHash: string;

  @ApiProperty({ description: 'Explorer link for the transaction' })
  explorerLink: string | null;
}

export class ProofsListResponseDto {
  @ApiProperty({ description: 'Array of proofs', type: [ProofDto] })
  data: ProofDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}

export class GenerateBalanceProofDto {
  @ApiProperty({
    description: 'Asset code to prove balance for (4-12 uppercase alphanumeric characters)',
    example: 'USDC',
  })
  @IsString()
  @Matches(/^[A-Z0-9]{4,12}$/, {
    message: 'Asset code must be between 4 and 12 uppercase alphanumeric characters',
  })
  assetCode: string;

  @ApiProperty({ description: 'Minimum threshold required for the proof', example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  threshold: number;

  @ApiPropertyOptional({
    description: 'Optional callback URL for webhook notification upon verification',
    example: 'https://example.com/api/webhook',
  })
  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    { message: 'webhook_url must be a valid HTTP or HTTPS URL' },
  )
  webhook_url?: string;
}

export class GenerateProofResponseDto {
  @ApiProperty({ description: 'Proof ID' })
  proofId: string;

  @ApiProperty({ description: 'Generated proof payload' })
  proofData: string;

  @ApiProperty({ description: 'Public inputs used by the proof generator' })
  publicInputs: Record<string, any>;

  @ApiProperty({ description: 'Commitment hash for the proof' })
  commitmentHash: string;
}

export class WebhookDeliveryAttemptDto {
  @ApiProperty({ description: 'Attempt number' })
  attemptNumber: number;

  @ApiProperty({ description: 'Timestamp of the delivery attempt' })
  timestamp: string;

  @ApiProperty({ description: 'Whether the attempt succeeded' })
  success: boolean;

  @ApiPropertyOptional({ description: 'HTTP response status code' })
  statusCode?: number;

  @ApiPropertyOptional({ description: 'Error message if attempt failed' })
  error?: string;
}

export class WebhookStatusResponseDto {
  @ApiProperty({ description: 'Proof ID' })
  proofId: string;

  @ApiPropertyOptional({ description: 'Webhook callback URL' })
  webhook_url: string | null;

  @ApiPropertyOptional({ description: 'When webhook was successfully delivered' })
  webhook_sent_at: Date | null;

  @ApiProperty({
    description: 'Delivery status',
    enum: ['pending', 'delivered', 'failed', 'not_configured'],
  })
  status: 'pending' | 'delivered' | 'failed' | 'not_configured';

  @ApiProperty({ description: 'Number of delivery attempts made' })
  attempts: number;

  @ApiProperty({
    description: 'Detailed delivery attempts history',
    type: [WebhookDeliveryAttemptDto],
  })
  deliveryAttempts: WebhookDeliveryAttemptDto[];
}
