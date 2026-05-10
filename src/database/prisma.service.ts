import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async connectWithRetry(
    retries = 5,
    delay = 3000,
  ): Promise<void> {
    let attempt = 0;

    while (attempt < retries) {
      try {
        await this.$connect();

        this.logger.log(
          'Successfully connected to PostgreSQL database',
        );

        return;
      } catch (error) {
        attempt++;

        this.logger.error(
          `Database connection failed (Attempt ${attempt}/${retries})`,
        );

        if (attempt >= retries) {
          throw error;
        }

        const exponentialDelay = delay * Math.pow(2, attempt);

        this.logger.warn(
          `Retrying database connection in ${exponentialDelay}ms`,
        );

        await new Promise((resolve) =>
          setTimeout(resolve, exponentialDelay),
        );
      }
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}