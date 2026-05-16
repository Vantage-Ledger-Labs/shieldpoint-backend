import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { StellarService } from './stellar.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import nock from 'nock';

const horizonUrl = 'https://horizon-testnet.stellar.org';
const verifierContractId = StellarSdk.StrKey.encodeContract(Buffer.alloc(32));

describe('StellarService', () => {
  let service: StellarService;

  beforeEach(() => {
    const configService = new ConfigService({
      STELLAR_NETWORK: 'testnet',
      RPC_URL: `${horizonUrl}/soroban/rpc`,
      VERIFIER_CONTRACT_ID: verifierContractId,
      REGISTRY_CONTRACT_ID: verifierContractId,
      STELLAR_SIGNER_SECRET:
        'SA7H4YB47LVSOZWY4ZTOTR4R3WS5VVJZBYNQKPXETJAFNFVC67MPT73F',
    });
    const metricsService = new MetricsService();

    service = new StellarService(configService, metricsService);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches native XLM balance from Stellar account', async () => {
    nock(horizonUrl)
      .get('/accounts/GTESTPUBLICKEY')
      .reply(200, {
        balances: [
          {
            asset_type: 'native',
            balance: '123.456',
          },
        ],
      });

    const balance = await service.getAccountBalance('GTESTPUBLICKEY', 'XLM');

    expect(balance).toBe('123.456');
  });

  it('throws when requested asset is not found on the account', async () => {
    nock(horizonUrl)
      .get('/accounts/GTESTPUBLICKEY')
      .reply(200, {
        balances: [{ asset_type: 'native', balance: '10.0' }],
      });

    await expect(
      service.getAccountBalance('GTESTPUBLICKEY', 'USD'),
    ).rejects.toThrow('Balance for asset USD not found');
  });

  it('retries transaction submission up to three times', async () => {
    const keypair = StellarSdk.Keypair.random();
    const fakeTx = new StellarSdk.TransactionBuilder(
      new StellarSdk.Account(keypair.publicKey(), '1'),
      {
        fee: '100',
        networkPassphrase: StellarSdk.Networks.TESTNET,
      },
    )
      .addOperation(
        StellarSdk.Operation.payment({
          destination: keypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '1',
        }),
      )
      .setTimeout(30)
      .build();

    fakeTx.sign(keypair);
    const fakeXdr = fakeTx.toXDR();

    const anyService = service as any;
    anyService.rpcServer = {
      sendTransaction: jest
        .fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue({ hash: 'tx-hash', latestLedger: 123 }),
    };

    const result = await service.submitTransaction(fakeXdr);

    expect(result).toEqual({ hash: 'tx-hash', ledger: 123 });
    expect(anyService.rpcServer.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('invokes verifier contract and submits a signed transaction', async () => {
    const anyService = service as any;
    anyService.horizonServer = {
      loadAccount: jest.fn().mockResolvedValue(
        new StellarSdk.Account(service['signerKeypair'].publicKey(), '1'),
      ),
    };

    anyService.submitTransactionWithRetry = jest
      .fn()
      .mockResolvedValue({ hash: 'contract-hash', ledger: 42 });

    const result = await service.invokeVerifierContract({ proof: 'data' });

    expect(result).toEqual({ hash: 'contract-hash', ledger: 42 });
    expect(service['submitTransactionWithRetry']).toHaveBeenCalledTimes(1);
  });

  it('invokes registry contract and submits a signed transaction', async () => {
    const anyService = service as any;
    anyService.horizonServer = {
      loadAccount: jest.fn().mockResolvedValue(
        new StellarSdk.Account(service['signerKeypair'].publicKey(), '1'),
      ),
    };

    anyService.submitTransactionWithRetry = jest
      .fn()
      .mockResolvedValue({ hash: 'registry-hash', ledger: 99 });

    const result = await service.invokeRegistryContract('proof-123');

    expect(result).toEqual({ hash: 'registry-hash', ledger: 99 });
    expect(service['submitTransactionWithRetry']).toHaveBeenCalledTimes(1);
  });
});
