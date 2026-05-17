import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StellarService {
  constructor(private readonly configService: ConfigService) {}

  async getBalance(stellarAccountId: string, assetCode: string): Promise<number> {
    const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL') || this.getHorizonUrl();
    const accountUrl = `${horizonUrl}/accounts/${encodeURIComponent(stellarAccountId)}`;

    let response: Response;
    try {
      response = await fetch(accountUrl);
    } catch (error) {
      throw new InternalServerErrorException('Failed to connect to Stellar Horizon');
    }

    if (response.status === 404) {
      throw new NotFoundException('Stellar account not found');
    }

    if (!response.ok) {
      throw new InternalServerErrorException('Failed to fetch balance from Stellar');
    }

    const account = await response.json();
    const rawBalances = account.balances || [];
    const targetAssetCode = assetCode.toUpperCase();

    const balanceItem = rawBalances.find((item) => {
      if (targetAssetCode === 'XLM' || targetAssetCode === 'NATIVE') {
        return item.asset_type === 'native';
      }
      return item.asset_code === targetAssetCode;
    });

    if (!balanceItem) {
      return 0;
    }

    const balanceValue = Number(balanceItem.balance);
    if (Number.isNaN(balanceValue)) {
      throw new InternalServerErrorException('Invalid balance value received from Stellar');
    }

    return balanceValue;
  }

  private getHorizonUrl(): string {
    const network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    return network === 'mainnet'
      ? 'https://horizon.stellar.org'
      : 'https://horizon-testnet.stellar.org';
  }
}
