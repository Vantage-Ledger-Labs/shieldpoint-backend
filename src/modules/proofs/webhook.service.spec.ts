import { WebhookService, WebhookTriggerPayload } from './webhook.service';
import { Proof, ProofStatus } from './entities/proof.entity';

describe('WebhookService', () => {
  let service: WebhookService;
  let proofRepository: any;
  let configService: any;

  beforeEach(() => {
    proofRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (proof: Proof) => proof),
    };

    configService = {
      get: jest.fn((key: string, defaultValue: any) => defaultValue),
    };

    service = new WebhookService(configService, proofRepository);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('successfully delivers webhook callback and updates webhook_sent_at', async () => {
    const proof = {
      id: 'proof-uuid-1',
      userId: 'user-uuid-1',
      status: ProofStatus.VERIFIED,
      webhook_url: 'https://example.com/api/callback',
      webhook_sent_at: null,
      metadata: {},
    } as Proof;

    proofRepository.findOne.mockResolvedValue(proof);

    // Mock global fetch to return 200 OK
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);
    global.fetch = mockFetch;

    const payload: WebhookTriggerPayload = {
      proofId: 'proof-uuid-1',
      userId: 'user-uuid-1',
      verifiedAt: new Date().toISOString(),
      txHash: '0x1234567890abcdef',
      threshold: 100,
      asset: 'USDC',
      webhookUrl: 'https://example.com/api/callback',
    };

    await service.deliverAttempt(payload, 1);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/callback',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'Shieldpoint-Webhook/1.0',
        }),
        body: JSON.stringify({
          proofId: 'proof-uuid-1',
          userId: 'user-uuid-1',
          verifiedAt: payload.verifiedAt,
          txHash: '0x1234567890abcdef',
          threshold: 100,
          asset: 'USDC',
        }),
      }),
    );

    expect(proof.webhook_sent_at).toBeInstanceOf(Date);
    expect(proof.metadata?.webhookDelivery?.status).toBe('delivered');
    expect(proof.metadata?.webhookDelivery?.attempts).toBe(1);
    expect(proof.metadata?.webhookDelivery?.attemptsHistory[0].success).toBe(true);
    expect(proof.metadata?.webhookDelivery?.attemptsHistory[0].statusCode).toBe(200);
  });

  it('records failed attempt and marks webhook_sent_at as null when HTTP endpoint fails', async () => {
    const proof = {
      id: 'proof-uuid-1',
      userId: 'user-uuid-1',
      status: ProofStatus.VERIFIED,
      webhook_url: 'https://example.com/api/callback',
      webhook_sent_at: null,
      metadata: {},
    } as Proof;

    proofRepository.findOne.mockResolvedValue(proof);

    // Mock global fetch to return 500 Internal Server Error
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);
    global.fetch = mockFetch;

    const payload: WebhookTriggerPayload = {
      proofId: 'proof-uuid-1',
      userId: 'user-uuid-1',
      verifiedAt: new Date().toISOString(),
      txHash: '0x1234567890abcdef',
      threshold: 50,
      asset: 'EURC',
      webhookUrl: 'https://example.com/api/callback',
    };

    await expect(service.deliverAttempt(payload, 1)).rejects.toThrow(
      'HTTP Error 500: Internal Server Error',
    );

    expect(proof.webhook_sent_at).toBeNull();
    expect(proof.metadata?.webhookDelivery?.attempts).toBe(1);
    expect(proof.metadata?.webhookDelivery?.status).toBe('pending');
    expect(proof.metadata?.webhookDelivery?.attemptsHistory[0].success).toBe(false);
    expect(proof.metadata?.webhookDelivery?.attemptsHistory[0].statusCode).toBe(500);
  });

  it('marks delivery permanently failed after maximum 3 attempts and keeps webhook_sent_at null', async () => {
    const proof = {
      id: 'proof-uuid-1',
      userId: 'user-uuid-1',
      status: ProofStatus.VERIFIED,
      webhook_url: 'https://example.com/api/callback',
      webhook_sent_at: null,
      metadata: {},
    } as Proof;

    proofRepository.findOne.mockResolvedValue(proof);

    const mockFetch = jest.fn().mockRejectedValue(new Error('Connection timed out'));
    global.fetch = mockFetch;

    const payload: WebhookTriggerPayload = {
      proofId: 'proof-uuid-1',
      userId: 'user-uuid-1',
      verifiedAt: new Date().toISOString(),
      txHash: '0x1234567890abcdef',
      threshold: 50,
      asset: 'EURC',
      webhookUrl: 'https://example.com/api/callback',
    };

    await expect(service.deliverAttempt(payload, 3)).rejects.toThrow('Connection timed out');

    expect(proof.webhook_sent_at).toBeNull();
    expect(proof.metadata?.webhookDelivery?.attempts).toBe(1);
    expect(proof.metadata?.webhookDelivery?.status).toBe('failed');
    expect(proof.metadata?.webhookDelivery?.attemptsHistory[0].success).toBe(false);
    expect(proof.metadata?.webhookDelivery?.attemptsHistory[0].error).toBe('Connection timed out');
  });

  it('returns not_configured status when proof has no webhook URL', async () => {
    const proof = {
      id: 'proof-uuid-2',
      userId: 'user-uuid-2',
      webhook_url: null,
      webhook_sent_at: null,
    } as Proof;

    const status = await service.getWebhookStatus(proof);

    expect(status).toEqual({
      proofId: 'proof-uuid-2',
      webhook_url: null,
      webhook_sent_at: null,
      status: 'not_configured',
      attempts: 0,
      deliveryAttempts: [],
    });
  });

  it('returns delivered status and delivery history when webhook was sent successfully', async () => {
    const sentDate = new Date('2026-11-09T03:00:00Z');
    const proof = {
      id: 'proof-uuid-3',
      userId: 'user-uuid-3',
      webhook_url: 'https://example.com/api/webhook',
      webhook_sent_at: sentDate,
      metadata: {
        webhookDelivery: {
          attempts: 1,
          status: 'delivered',
          attemptsHistory: [
            {
              attemptNumber: 1,
              timestamp: '2026-11-09T03:00:00Z',
              success: true,
              statusCode: 200,
            },
          ],
        },
      },
    } as unknown as Proof;

    const status = await service.getWebhookStatus(proof);

    expect(status).toEqual({
      proofId: 'proof-uuid-3',
      webhook_url: 'https://example.com/api/webhook',
      webhook_sent_at: sentDate,
      status: 'delivered',
      attempts: 1,
      deliveryAttempts: [
        {
          attemptNumber: 1,
          timestamp: '2026-11-09T03:00:00Z',
          success: true,
          statusCode: 200,
        },
      ],
    });
  });
});
