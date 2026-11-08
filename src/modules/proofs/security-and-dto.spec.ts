import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GenerateBalanceProofDto } from './dto/proofs.dto';
import { AppThrottlerGuard } from '../../common/guards/app-throttler.guard';
import * as jwt from 'jsonwebtoken';

describe('Security & Validation Test Suite', () => {
  describe('GenerateBalanceProofDto Validation', () => {
    it('accepts valid 4-12 uppercase alphanumeric asset codes and valid https webhook URL', async () => {
      const dto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'USDC',
        threshold: 100,
        webhook_url: 'https://example.com/api/proofs/callback',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects asset codes with fewer than 4 characters', async () => {
      const dto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'XLM', // 3 chars
        threshold: 100,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('assetCode');
    });

    it('rejects asset codes with lowercase characters', async () => {
      const dto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'usdc',
        threshold: 100,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('assetCode');
    });

    it('rejects asset codes longer than 12 characters', async () => {
      const dto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'VERYLONGTOKENNAME',
        threshold: 100,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('assetCode');
    });

    it('rejects disallowed protocols in webhook_url (non-http/https allowlist)', async () => {
      const ftpDto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'USDC',
        threshold: 100,
        webhook_url: 'ftp://malicious.org/exfil',
      });

      const ftpErrors = await validate(ftpDto);
      expect(ftpErrors.length).toBeGreaterThan(0);
      expect(ftpErrors[0].property).toBe('webhook_url');

      const fileDto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'USDC',
        threshold: 100,
        webhook_url: 'file:///etc/passwd',
      });

      const fileErrors = await validate(fileDto);
      expect(fileErrors.length).toBeGreaterThan(0);
      expect(fileErrors[0].property).toBe('webhook_url');
    });

    it('accepts valid http and https protocols for webhook_url', async () => {
      const httpDto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'USDC',
        threshold: 50,
        webhook_url: 'http://localhost:3000/webhook',
      });

      const httpErrors = await validate(httpDto);
      expect(httpErrors.length).toBe(0);

      const httpsDto = plainToInstance(GenerateBalanceProofDto, {
        assetCode: 'SHIELDCOIN',
        threshold: 500,
        webhook_url: 'https://webhook.site/test-uuid',
      });

      const httpsErrors = await validate(httpsDto);
      expect(httpsErrors.length).toBe(0);
    });
  });

  describe('AppThrottlerGuard Tracker Resolution', () => {
    let guard: AppThrottlerGuard;

    beforeEach(() => {
      guard = new AppThrottlerGuard(
        { throttlers: [] } as any,
        {} as any,
        {} as any,
      );
    });

    it('resolves user-based tracker key from Bearer JWT header', async () => {
      const token = jwt.sign({ userId: 'user-xyz-123' }, 'test-secret');
      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
        ip: '192.168.1.100',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user_user-xyz-123');
    });

    it('resolves user-based tracker key from req.user', async () => {
      const req = {
        user: { userId: 'user-abc-456' },
        ip: '192.168.1.100',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user_user-abc-456');
    });

    it('resolves client IP tracker key for unauthenticated requests', async () => {
      const req = {
        headers: {},
        ip: '203.0.113.195',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('203.0.113.195');
    });
  });
});
