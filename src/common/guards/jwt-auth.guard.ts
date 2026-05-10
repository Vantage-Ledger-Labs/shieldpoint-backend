import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * JWT Auth Guard for protecting endpoints
 * Can be used as middleware or directly in controllers
 */
@Injectable()
export class JwtAuthGuard {
  constructor(private configService: ConfigService) {}

  /**
   * Verify JWT token and extract user ID
   * Expected format: Authorization: Bearer <token>
   */
  verifyToken(authHeader: string): AuthPayload {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const secret = this.configService.get<string>('JWT_SECRET', 'your-secret-key-here');

    try {
      const decoded = jwt.verify(token, secret) as AuthPayload;
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Extract and verify user ID from Authorization header
   */
  extractUserId(authHeader: string): string {
    const payload = this.verifyToken(authHeader);
    return payload.userId;
  }
}
