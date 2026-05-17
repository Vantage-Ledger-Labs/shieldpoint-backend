import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ProofsService } from './proofs.service';
import { Proof, ProofStatus } from './entities/proof.entity';

describe('ProofsService', () => {
  let service: ProofsService;
  let proofRepository: any;
  let stellarService: any;
  let configService: any;

  beforeEach(() => {
    proofRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (proof: Proof) => proof),
    };

    stellarService = {
      invokeVerifierContract: jest.fn(),
      waitForTransactionConfirmation: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string, defaultValue: any) =>
        key === 'STELLAR_NETWORK' ? 'testnet' : defaultValue,
      ),
    };

    service = new ProofsService(proofRepository, stellarService, configService);
  });

  it('submits proof to the Soroban verifier contract and updates proof status', async () => {
    const proof = {
      id: 'proof-1',
      userId: 'user-1',
      status: ProofStatus.PENDING,
      proofData: JSON.stringify({ foo: 'bar' }),
      transactionHash: null,
      verifiedAt: null,
      errorMessage: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
    } as Proof;

    proofRepository.findOne.mockResolvedValue(proof);
    stellarService.invokeVerifierContract.mockResolvedValue({ hash: 'tx-hash', ledger: 123 });
    stellarService.waitForTransactionConfirmation.mockResolvedValue({ status: 'SUCCESS' });

    const result = await service.verifyProof('proof-1', 'user-1');

    expect(stellarService.invokeVerifierContract).toHaveBeenCalledWith({ proof: { foo: 'bar' } });
    expect(stellarService.waitForTransactionConfirmation).toHaveBeenCalledWith('tx-hash', 5);
    expect(result).toEqual({
      success: true,
      txHash: 'tx-hash',
      explorerLink: expect.any(String),
    });
    expect(proof.status).toBe(ProofStatus.VERIFIED);
    expect(proof.transactionHash).toBe('tx-hash');
    expect(proof.verifiedAt).toBeInstanceOf(Date);
  });

  it('rejects verification when proof is already verified', async () => {
    proofRepository.findOne.mockResolvedValue({
      id: 'proof-1',
      userId: 'user-1',
      status: ProofStatus.VERIFIED,
      proofData: '{}',
      createdAt: new Date(),
      updatedAt: new Date(),
      verifiedAt: new Date(),
      expiresAt: null,
    } as Proof);

    await expect(service.verifyProof('proof-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects expired proofs and marks them as failed', async () => {
    const proof = {
      id: 'proof-1',
      userId: 'user-1',
      status: ProofStatus.PENDING,
      proofData: '{}',
      transactionHash: null,
      verifiedAt: null,
      errorMessage: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() - 10000),
    } as Proof;

    proofRepository.findOne.mockResolvedValue(proof);

    await expect(service.verifyProof('proof-1', 'user-1')).rejects.toThrow('Proof has expired');
    expect(proof.status).toBe(ProofStatus.FAILED);
    expect(proof.errorMessage).toBe('Proof has expired');
  });

  it('updates proof status to failed when contract verification fails', async () => {
    const proof = {
      id: 'proof-1',
      userId: 'user-1',
      status: ProofStatus.PENDING,
      proofData: '{}',
      transactionHash: null,
      verifiedAt: null,
      errorMessage: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: null,
    } as Proof;

    proofRepository.findOne.mockResolvedValue(proof);
    stellarService.invokeVerifierContract.mockResolvedValue({ hash: 'tx-hash', ledger: 42 });
    stellarService.waitForTransactionConfirmation.mockRejectedValue(new Error('Contract reverted'));

    await expect(service.verifyProof('proof-1', 'user-1')).rejects.toThrow(InternalServerErrorException);
    expect(proof.status).toBe(ProofStatus.FAILED);
    expect(proof.errorMessage).toBe('Contract reverted');
  });
});
