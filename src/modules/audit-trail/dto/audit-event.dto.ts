import { User } from "@/modules/auth/entities/user.entity";
import { ApiProperty } from "@nestjs/swagger";

export class AuditEventResponseDto {
    @ApiProperty()
    id: number;
  
    @ApiProperty()
    action: string;
  
    @ApiProperty({ required: false })
    projectId: number;
  
    @ApiProperty()
    resourceType: string;
  
    @ApiProperty()
    resourceId: string;
  
    @ApiProperty()
    metadata: any;
  
    @ApiProperty()
    createdAt: Date;
  
    @ApiProperty({ type: () => User, nullable: true })
    user: User | null;
  }