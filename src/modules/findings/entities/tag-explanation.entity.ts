import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity()
@Unique(['tag'])
export class TagExplanation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tag: string;

  @Column({ type: 'text' })
  explanation: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  generatedAt: Date;
}
