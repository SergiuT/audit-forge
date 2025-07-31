import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, CreateDateColumn } from "typeorm";
import { DependencyType, LockfileEcosystem } from "../../../shared/types/types";
import { ComplianceReport } from "@/modules/compliance/entities/compliance-report.entity";

@Entity()
export class ScannedDependency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ComplianceReport, (report) => report.dependencies, {
    onDelete: 'CASCADE',
  })
  report: ComplianceReport;

  @Column()
  name: string;

  @Column()
  version: string;

  @Column({ type: 'enum', enum: LockfileEcosystem })
  ecosystem: LockfileEcosystem;

  @Column({ type: 'enum', enum: DependencyType })
  dependencyType: DependencyType;

  @Column({ nullable: true })
  parsedFrom: string; // e.g. 'package-lock.json'

  @CreateDateColumn()
  createdAt: Date;
}