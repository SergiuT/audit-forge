// modules/integrations/dto/create-integration.dto.ts
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { IntegrationType } from '../entities/integration.entity';

export class CreateIntegrationDto {
  @IsEnum(IntegrationType)
  type: IntegrationType;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  projectId: string;

  @IsString()
  userId: string;

  @IsString()
  credentials: string;

  @IsBoolean()
  useManager: boolean;
}
