import { Injectable, UnauthorizedException } from '@nestjs/common';

import * as StellarSdk from 'stellar-sdk';

@Injectable()
export class StellarService {
  verifySignature(
    challenge: string,
    signature: string,
    publicKey: string,
  ): boolean {
    try {
      const keypair =
        StellarSdk.Keypair.fromPublicKey(publicKey);

      const verified =
        keypair.verify(
          Buffer.from(challenge),
          Buffer.from(signature, 'base64'),
        );

      return verified;
    } catch {
      throw new UnauthorizedException(
        'Invalid Stellar signature',
      );
    }
  }
}