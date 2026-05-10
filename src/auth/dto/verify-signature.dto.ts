import { IsString } from 'class-validator';

export class VerifySignatureDto {
  @IsString()
  challenge: string;

  @IsString()
  signature: string;

  @IsString()
  public_key: string;
}