import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: 'Role name (unique)', example: 'Department Manager' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Role description', example: 'Manages department operations' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ 
    description: 'Array of permission strings', 
    example: ['documents:view', 'documents:create', 'documents:edit'] 
  })
  @IsArray()
  permissions!: string[];

  @ApiPropertyOptional({ description: 'Role active status', example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
