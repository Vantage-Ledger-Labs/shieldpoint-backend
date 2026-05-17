import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue, QueueScheduler, Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Proof } from './entities/proof.entity';

export interface ProofQueuePayload {
  proofId: string;
  userId: string;
  assetCode: string;
  threshold: number;
  balance: number;
  commitmentHash: string;
}

@Injectable()
export class ProofGenerationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProofGenerationQueueService.name);
  private queue: Queue;
  private queueScheduler: QueueScheduler;
  private worker: Worker;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Proof)
    private readonly proofRepository: Repository<Proof>,
  ) {
    const connection = {
      connection: {
        url: this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),
      },
    };

    this.queue = new Queue('proof-generation', connection);
    this.queueScheduler = new QueueScheduler('proof-generation', connection);
    this.worker = new Worker('proof-generation', this.processJob.bind(this), connection);

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Proof generation job failed (${job.id}): ${err?.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await Promise.all([
        this.queue.waitUntilReady(),
        this.queueScheduler.waitUntilReady(),
        this.worker.waitUntilReady(),
      ]);
      this.logger.log('Proof generation queue initialized');
    } catch (error) {
      this.logger.warn(`Proof generation queue failed to initialize: ${error?.message || error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.worker.close(),
      this.queueScheduler.close(),
      this.queue.close(),
    ]);
  }

  async enqueueProofJob(payload: ProofQueuePayload) {
    return this.queue.add('proof-generated', payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  private async processJob(job: Job<ProofQueuePayload>): Promise<void> {
    this.logger.log(`Processing proof generation queue job ${job.id}`);

    const proof = await this.proofRepository.findOneBy({ id: job.data.proofId });
    if (!proof) {
      throw new Error(`Proof record not found for job ${job.id}`);
    }

    proof.metadata = {
      ...proof.metadata,
      queue: {
        jobId: job.id,
        processedAt: new Date().toISOString(),
        proofId: job.data.proofId,
        assetCode: job.data.assetCode,
        threshold: job.data.threshold,
        balance: job.data.balance,
      },
    };

    await this.proofRepository.save(proof);
  }
}
