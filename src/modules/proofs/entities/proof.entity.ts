import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum ProofStatus {
  PENDING = 'pending',
  GENERATED = 'generated',
  VERIFIED = 'verified',
  FAILED = 'failed',
}

@Entity('proofs')
@Index(['userId', 'createdAt'], { name: 'idx_proofs_user_created' })
@Index(['userId'], { name: 'idx_proofs_user_id' })
@Index(['status'], { name: 'idx_proofs_status' })
@Index(['createdAt'], { name: 'idx_proofs_created_at' })
export class Proof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({
    type: 'enum',
    enum: ProofStatus,
    default: ProofStatus.PENDING,
  })
  status: ProofStatus;

  @Column('text')
  proofData: string;

  @Column('text', { nullable: true })
  transactionHash: string | null;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;

  @Column('text', { nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('timestamp', { nullable: true })
  verifiedAt: Date | null;
}
