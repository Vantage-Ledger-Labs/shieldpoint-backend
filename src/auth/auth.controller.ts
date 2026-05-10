import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service';

import { VerifySignatureDto } from './dto/verify-signature.dto';

import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('challenge')
  async challenge() {
    return this.authService.generateChallenge();
  }

  @Post('verify')
  async verify(
    @Body() dto: VerifySignatureDto,
  ) {
    return this.authService.verifyWalletSignature(
      dto.challenge,
      dto.signature,
      dto.public_key,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('logout')
  async logout(@Req() req: any) {
    return this.authService.logout(
      req.user.userId,
    );
  }
}