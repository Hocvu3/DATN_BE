import { IsOptional, IsString, IsNumber, IsEnum, IsBoolean, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { DocumentStatus, SecurityLevel } from '@prisma/client';

export class GetDocumentsQueryDto {
  @ApiProperty({ example: 1, description: 'Page number', required: false, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 1;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 1 : parsed;
  })
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 10, description: 'Items per page', required: false, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 10;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 10 : parsed;
  })
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({
    example: 'project requirements',
    description: 'Search by title or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    example: 'DRAFT',
    description: 'Filter by status',
    enum: DocumentStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiProperty({
    example: 'INTERNAL',
    description: 'Filter by security level',
    enum: SecurityLevel,
    required: false,
  })
  @IsOptional()
  @IsEnum(SecurityLevel)
  securityLevel?: SecurityLevel;

  @ApiProperty({ example: true, description: 'Filter by confidential status', required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @Type(() => Boolean)
  isConfidential?: boolean;

  @ApiProperty({
    example: 'uuid-department-id',
    description: 'Filter by department ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({ example: 'uuid-creator-id', description: 'Filter by creator ID', required: false })
  @IsOptional()
  @IsString()
  creatorId?: string;

  @ApiProperty({ example: 'tag1', description: 'Filter by tag name', required: false })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({
    example: '2024-01-01',
    description: 'Filter by creation date from (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @ApiProperty({
    example: '2024-12-31',
    description: 'Filter by creation date to (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsString()
  createdTo?: string;
}
