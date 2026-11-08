import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Proof } from './entities/proof.entity';
import { WebhookStatusResponseDto, WebhookDeliveryAttemptDto } from './dto/proofs.dto';

export interface WebhookTriggerPayload {
  proofId: string;
  userId: string;
  verifiedAt: string;
  txHash: string;
  threshold: number;
  asset: string;
  webhookUrl: string;
}

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Proof)
    private readonly proofRepository: Repository<Proof>,
  ) {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
      const connection = {
        connection: {
          url: redisUrl,
        } as any,
      };

      this.queue = new Queue('proof-webhooks', connection as any);
      this.worker = new Worker('proof-webhooks', this.processJob.bind(this), connection as any);

      this.worker.on('failed', async (job: any, err: any) => {
        this.logger.error(
          `Webhook job failed for proof ${job?.data?.proofId} (attempt ${job?.attemptsMade}/3): ${err?.message}`,
        );
        if (job && job.attemptsMade >= 3) {
          await this.markWebhookFailed(job.data.proofId, err?.message || 'Max retries reached');
        }
      });
    } catch (err: any) {
      this.logger.warn(`Webhook queue initialization skipped or failed: ${err?.message || err}`);
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.queue && this.worker) {
      try {
        await Promise.all([
          this.queue.waitUntilReady(),
          this.worker.waitUntilReady(),
        ]);
        this.logger.log('Webhook BullMQ queue initialized successfully');
      } catch (error: any) {
        this.logger.warn(`Webhook BullMQ queue failed to connect to Redis: ${error?.message || error}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.worker?.close(),
      this.queue?.close(),
    ]);
  }

  async triggerWebhook(payload: WebhookTriggerPayload): Promise<void> {
    this.logger.log(`Triggering webhook delivery for proof ${payload.proofId} to ${payload.webhookUrl}`);

    if (this.queue) {
      try {
        await this.queue.add('send-webhook', payload, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000, // 1s, 2s, 4s exponential backoff
          },
        });
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue webhook via BullMQ, falling back to direct delivery: ${err?.message}`);
      }
    }

    // Direct fallback delivery with exponential backoff if BullMQ / Redis is offline
    await this.deliverWithRetries(payload);
  }

  async processJob(job: Job<WebhookTriggerPayload>): Promise<void> {
    await this.deliverAttempt(job.data, job.attemptsMade + 1);
  }

  async deliverWithRetries(payload: WebhookTriggerPayload): Promise<boolean> {
    const delays = [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.deliverAttempt(payload, attempt);
        return true;
      } catch (err: any) {
        this.logger.warn(
          `Webhook delivery attempt ${attempt}/3 failed for proof ${payload.proofId}: ${err?.message}`,
        );
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
        } else {
          await this.markWebhookFailed(payload.proofId, err?.message || 'Max retries exceeded');
        }
      }
    }
    return false;
  }

  async deliverAttempt(data: WebhookTriggerPayload, attemptNumber: number): Promise<void> {
    const proof = await this.proofRepository.findOne({ where: { id: data.proofId } });
    if (!proof) {
      throw new Error(`Proof record ${data.proofId} not found for webhook delivery`);
    }

    const payload = {
      proofId: data.proofId,
      userId: data.userId,
      verifiedAt: data.verifiedAt,
      txHash: data.txHash,
      threshold: data.threshold,
      asset: data.asset,
    };

    let response: Response | undefined;
    let success = false;
    let statusCode: number | undefined;
    let errorMsg: string | undefined;

    try {
      response = await fetch(data.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Shieldpoint-Webhook/1.0',
        },
        body: JSON.stringify(payload),
      });

      statusCode = response.status;
      if (response.ok) {
        success = true;
      } else {
        errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      }
    } catch (err: any) {
      errorMsg = err?.message || 'Network error occurred during webhook HTTP request';
    }

    // Update attempts history in proof metadata
    const metadata = proof.metadata || {};
    const webhookDelivery = metadata.webhookDelivery || {
      attempts: 0,
      status: 'pending',
      attemptsHistory: [],
    };

    webhookDelivery.attempts = (webhookDelivery.attempts || 0) + 1;
    webhookDelivery.lastAttemptAt = new Date().toISOString();
    webhookDelivery.attemptsHistory = webhookDelivery.attemptsHistory || [];
    webhookDelivery.attemptsHistory.push({
      attemptNumber,
      timestamp: new Date().toISOString(),
      success,
      statusCode,
      error: errorMsg,
    });

    if (success) {
      webhookDelivery.status = 'delivered';
      proof.webhook_sent_at = new Date();
      proof.metadata = { ...metadata, webhookDelivery };
      await this.proofRepository.save(proof);
      this.logger.log(`Webhook successfully delivered for proof ${data.proofId}`);
    } else {
      webhookDelivery.status = attemptNumber >= 3 ? 'failed' : 'pending';
      webhookDelivery.lastError = errorMsg;
      proof.webhook_sent_at = null;
      proof.metadata = { ...metadata, webhookDelivery };
      await this.proofRepository.save(proof);
      throw new Error(errorMsg || `Webhook delivery attempt ${attemptNumber} failed`);
    }
  }

  async markWebhookFailed(proofId: string, error: string): Promise<void> {
    const proof = await this.proofRepository.findOne({ where: { id: proofId } });
    if (!proof) return;

    proof.webhook_sent_at = null;
    const metadata = proof.metadata || {};
    const webhookDelivery = metadata.webhookDelivery || {
      attempts: 3,
      status: 'failed',
      attemptsHistory: [],
    };
    webhookDelivery.status = 'failed';
    webhookDelivery.lastError = error;
    proof.metadata = { ...metadata, webhookDelivery };

    await this.proofRepository.save(proof);
    this.logger.error(`Webhook delivery marked permanently failed for proof ${proofId}: ${error}`);
  }

  async getWebhookStatus(proof: Proof): Promise<WebhookStatusResponseDto> {
    if (!proof.webhook_url) {
      return {
        proofId: proof.id,
        webhook_url: null,
        webhook_sent_at: null,
        status: 'not_configured',
        attempts: 0,
        deliveryAttempts: [],
      };
    }

    const webhookDelivery = proof.metadata?.webhookDelivery;
    const attempts = webhookDelivery?.attempts || 0;
    const deliveryAttempts: WebhookDeliveryAttemptDto[] = webhookDelivery?.attemptsHistory || [];

    let status: 'pending' | 'delivered' | 'failed' | 'not_configured' = 'pending';
    if (proof.webhook_sent_at) {
      status = 'delivered';
    } else if (webhookDelivery?.status === 'failed' || attempts >= 3) {
      status = 'failed';
    }

    return {
      proofId: proof.id,
      webhook_url: proof.webhook_url,
      webhook_sent_at: proof.webhook_sent_at,
      status,
      attempts,
      deliveryAttempts,
    };
  }
}
