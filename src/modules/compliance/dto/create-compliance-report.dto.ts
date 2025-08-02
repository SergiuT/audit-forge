import { IsString, IsOptional, IsInt, IsNotEmpty, IsIn, IsNumber, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportDataDto } from './report-data.dto';
import { ReportSource } from '@/shared/types/types';

export class CreateComplianceReportDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsString()
  @IsNotEmpty()
  @Transform(({value}) => value.trim())  // Sanitizing string by trimming it
  reportData: ReportDataDto;

  @IsInt()
  @IsNotEmpty()
  projectId: number;

  @IsString()
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  @Transform(({value}) => value.trim())  // Sanitizing status field
  status?: string = 'pending';

  @IsNotEmpty()
  @IsString()
  fileDataKey?: string; 

  @IsOptional()
  @IsString()
  source?: ReportSource;

  @IsOptional()
  @IsNumber()
  complianceScore?: number;

  @IsOptional()
  @IsObject()
  categoryScores?: Record<string, number>;

  @IsOptional()
  @IsObject()
  controlScores?: Record<string, number>;

  @IsOptional()
  @IsObject()
  driftComparison?: {
    newFindings: string[];
    resolvedFindings: string[];
    unchangedFindings: string[];
    scoreDelta: number;
    categoryScoreDelta: Record<string, number>;
    controlScoreDelta: Record<string, number>;
  };
}
