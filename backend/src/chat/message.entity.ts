import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type RiskLevel = 'green' | 'yellow' | 'orange' | 'red';

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  question: string;

  @Column('text')
  answer: string;

  @Column({ default: 'green' })
  level: RiskLevel;

  @CreateDateColumn()
  createdAt: Date;
}
