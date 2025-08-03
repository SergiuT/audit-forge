import { IsString, IsOptional, IsObject, IsNumber, IsDate } from 'class-validator';

export class ReportDetailsDto {
  @IsString()
  @IsOptional()
  repo?: string;

  @IsString()
  @IsOptional()
  integrationId?: string;

  @IsString()
  @IsOptional()
  runId?: number;

  @IsString()
  @IsOptional()
  source?: string;

  @IsDate()
  @IsOptional()
  scannedAt?: Date;

  @IsDate()
  @IsOptional()
  ingestedAt?: Date;

  @IsString()
  @IsOptional()
  tokenType?: string;

  @IsNumber()
  @IsOptional()
  scannedBy?: number;

  @IsString()
  @IsOptional()
  prefix?: string;

  @IsNumber()
  @IsOptional()
  logFilesProcessed?: number;

  @IsString()
  @IsOptional()
  bucket?: string;
}

export class ReportDataDto {
  @IsString()
  @IsOptional()
  description: string; // Just an example property

  @IsObject()
  @IsOptional()
  details: ReportDetailsDto;

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
