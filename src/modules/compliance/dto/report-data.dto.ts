import { IsString, IsOptional, IsObject } from 'class-validator';

export class ReportDataDto {
  @IsString()
  @IsOptional()
  description: string; // Just an example property

  @IsObject()
  @IsOptional()
  details: object;

  @IsOptional()
  @IsString()
  repo?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  scannedAt?: string;

  @IsOptional()
  @IsString()
  tokenType?: string;

  @IsOptional()
  @IsString()
  integrationId?: string;

  @IsOptional()
  runId?: number;

  @IsOptional()
  scannedBy?: number;
}
