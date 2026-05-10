import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { randomBytes } from 'crypto';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async generateChallenge() {
    const challenge =
      randomBytes(32).toString('hex');

    return {
      challenge,
      expires_in: 300,
    };
  }

  async verifyWalletSignature(
    challenge: string,
    signature: string,
    publicKey: string,
  ) {
    /**
     * Verify Stellar signature
     * Prevent replay attack
     * Create/retrieve user
     * Generate JWT tokens
     */

    const user =
      await this.prisma.user.upsert({
        where: {
          stellar_address: publicKey,
        },

        update: {
          last_login: new Date(),
        },

        create: {
          stellar_address: publicKey,
        },
      });

    const payload = {
      sub: user.id,
      stellar_address: user.stellar_address,
    };

    const accessToken =
      await this.jwtService.signAsync(
        payload,
        {
          secret:
            process.env.JWT_ACCESS_SECRET,

          expiresIn:
            process.env.JWT_ACCESS_EXPIRES_IN,
        },
      );

    const refreshToken =
      await this.jwtService.signAsync(
        payload,
        {
          secret:
            process.env.JWT_REFRESH_SECRET,

          expiresIn:
            process.env.JWT_REFRESH_EXPIRES_IN,
        },
      );

    const hashedRefreshToken =
      await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,

        hashed_token:
          hashedRefreshToken,

        expires_at: new Date(
          Date.now() +
            7 * 24 * 60 * 60 * 1000,
        ),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user,
    };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        user_id: userId,
      },

      data: {
        revoked: true,
      },
    });

    return {
      message:
        'Refresh tokens invalidated successfully',
    };
  }
}