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
@Index('idx_proofs_user_created', ['userId', 'createdAt'])
@Index('idx_proofs_user_id', ['userId'])
@Index('idx_proofs_status', ['status'])
@Index('idx_proofs_created_at', ['createdAt'])
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

  @Column('timestamp', { nullable: true })
  expiresAt: Date | null;
}
