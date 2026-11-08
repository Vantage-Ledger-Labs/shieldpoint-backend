import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If request contains authorization header with Bearer token, extract userId for user-based throttling
    const authHeader = req.headers?.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = jwt.decode(token) as any;
        if (decoded?.userId) {
          return `user_${decoded.userId}`;
        }
      } catch {
        // Fall back to IP on decoding error
      }
    }

    if (req.user?.userId || req.user?.id) {
      return `user_${req.user.userId || req.user.id}`;
    }

    // Default to IP address for unauthenticated requests
    if (req.ips && Array.isArray(req.ips) && req.ips.length > 0) {
      return req.ips[0];
    }

    return req.ip || req.connection?.remoteAddress || '127.0.0.1';
  }
}
