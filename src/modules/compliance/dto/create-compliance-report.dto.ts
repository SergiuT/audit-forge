import { IsString, IsOptional, IsInt, IsNotEmpty, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportDataDto } from './report-data.dto';

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
}
