import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { Server as RpcServer } from 'stellar-sdk/rpc';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private horizonServer: any;
  private rpcServer: any;
  private readonly networkPassphrase: string;
  private readonly verifierContractId: string;
  private readonly registryContractId: string;
  private readonly signerKeypair?: StellarSdk.Keypair;

  constructor(private configService: ConfigService) {
    const network = this.configService.get<string>('STELLAR_NETWORK', 'testnet').toLowerCase();
    const rpcUrl = this.configService.get<string>('RPC_URL') || this.getDefaultRpcUrl(network);
    this.horizonServer = new StellarSdk.Horizon.Server(this.getHorizonUrl(rpcUrl));
    this.rpcServer = new RpcServer(this.getRpcUrl(rpcUrl));
    this.networkPassphrase = this.getNetworkPassphrase(network);
    this.verifierContractId = this.configService.get<string>('VERIFIER_CONTRACT_ID', '');
    this.registryContractId = this.configService.get<string>('REGISTRY_CONTRACT_ID', '');

    const signerSecret = this.configService.get<string>('STELLAR_SIGNER_SECRET');
    if (signerSecret) {
      this.signerKeypair = StellarSdk.Keypair.fromSecret(signerSecret);
    }
  }

  async getAccountBalance(publicKey: string, assetCode: string): Promise<string> {
    try {
      const account = await this.horizonServer.accounts().accountId(publicKey).call();
      const normalizedAssetCode = assetCode?.toUpperCase?.() || 'XLM';

      const balance = account.balances.find((entry: any) => {
        if (normalizedAssetCode === 'XLM' || normalizedAssetCode === 'XLM_NATIVE') {
          return entry.asset_type === 'native';
        }

        return entry.asset_code === normalizedAssetCode;
      });

      if (!balance) {
        throw new NotFoundException(`Balance for asset ${assetCode} not found`);
      }

      const result = balance.balance;
      this.logger.log(`Fetched balance for account ${publicKey} asset ${assetCode}: ${result}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to fetch balance for account ${publicKey}`, error);
      throw error instanceof NotFoundException
        ? error
        : new InternalServerErrorException('Unable to fetch Stellar account balance');
    }
  }

  async submitTransaction(xdr: string): Promise<{ hash: string; ledger: number }> {
    return this.submitTransactionWithRetry(xdr, 3);
  }

  async invokeVerifierContract(proofData: object): Promise<{ hash: string; ledger: number }> {
    if (!this.verifierContractId) {
      throw new InternalServerErrorException('VERIFIER_CONTRACT_ID is not configured');
    }

    return this.invokeContract(this.verifierContractId, 'verify', [proofData]);
  }

  async invokeRegistryContract(proofId: string): Promise<{ hash: string; ledger: number }> {
    if (!this.registryContractId) {
      throw new InternalServerErrorException('REGISTRY_CONTRACT_ID is not configured');
    }

    return this.invokeContract(this.registryContractId, 'register', [proofId]);
  }

  private async submitTransactionWithRetry(
    xdr: string,
    maxAttempts: number,
  ): Promise<{ hash: string; ledger: number }> {
    let attempt = 1;
    let lastError: any;

    while (attempt <= maxAttempts) {
      try {
        const transaction = StellarSdk.TransactionBuilder.fromXDR(
          xdr,
          this.networkPassphrase,
        );
        const response = await this.rpcServer.sendTransaction(transaction);
        const result = {
          hash: response.hash,
          ledger: Number(response.latestLedger),
        };

        this.logger.log(`Stellar transaction submitted (attempt ${attempt}): ${result.hash}`);
        return result;
      } catch (error) {
        lastError = error;
        this.logger.error(`Stellar transaction failed on attempt ${attempt}`, error);

        if (attempt >= maxAttempts) {
          break;
        }

        await this.delay(500 * attempt);
        attempt += 1;
      }
    }

    throw new InternalServerErrorException(
      `Transaction submission failed after ${maxAttempts} attempts`,
      lastError,
    );
  }

  private async invokeContract(
    contractId: string,
    functionName: string,
    parameters: unknown[],
  ): Promise<{ hash: string; ledger: number }> {
    if (!this.signerKeypair) {
      throw new InternalServerErrorException(
        'STELLAR_SIGNER_SECRET is required to invoke Soroban contracts',
      );
    }

    const sourcePublicKey = this.signerKeypair.publicKey();
    const sourceAccount = await this.horizonServer.loadAccount(sourcePublicKey);
    const contractBytes = StellarSdk.StrKey.decodeContract(contractId);
    const hostFunction = StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
      new StellarSdk.xdr.InvokeContractArgs({
        contractAddress: StellarSdk.xdr.ScAddress.scAddressTypeContract(contractBytes),
        functionName,
        args: parameters.map((parameter) => this.buildScVal(parameter)),
      }),
    );

    const operation = StellarSdk.Operation.invokeHostFunction({
      func: hostFunction,
      auth: [],
    });

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(180)
      .build();

    transaction.sign(this.signerKeypair);
    const transactionXdr = transaction.toXDR();
    const builtXdr = typeof transactionXdr === 'string' ? transactionXdr : Buffer.from(transactionXdr).toString('base64');
    return this.submitTransactionWithRetry(builtXdr, 3);
  }

  private buildScVal(value: unknown): any {
    if (typeof value === 'string') {
      return StellarSdk.xdr.ScVal.scvString(value);
    }

    if (typeof value === 'number') {
      return StellarSdk.xdr.ScVal.scvU32(value);
    }

    if (typeof value === 'boolean') {
      return StellarSdk.xdr.ScVal.scvSymbol(String(value));
    }

    return StellarSdk.xdr.ScVal.scvString(JSON.stringify(value));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getDefaultRpcUrl(network: string): string {
    if (network === 'mainnet') {
      return 'https://horizon.stellar.org/soroban/rpc';
    }

    if (network === 'futurenet') {
      return 'https://horizon-futurenet.stellar.org/soroban/rpc';
    }

    return 'https://horizon-testnet.stellar.org/soroban/rpc';
  }

  private getHorizonUrl(rpcUrl: string): string {
    return rpcUrl.replace(/\/soroban\/rpc$/, '');
  }

  private getRpcUrl(rpcUrl: string): string {
    return rpcUrl.endsWith('/soroban/rpc') ? rpcUrl : `${rpcUrl.replace(/\/$/, '')}/soroban/rpc`;
  }

  private getNetworkPassphrase(network: string): string {
    if (network === 'mainnet') {
      return StellarSdk.Networks.PUBLIC;
    }

    if (network === 'futurenet') {
      return 'Test SDF Future Network ; September 2023';
    }

    return StellarSdk.Networks.TESTNET;
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
