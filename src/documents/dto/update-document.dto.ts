import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus, SecurityLevel } from '@prisma/client';

export class UpdateDocumentDto {
  @ApiProperty({
    example: 'Updated Project Requirements Document',
    description: 'Document title',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiProperty({
    example: 'Updated document description',
    description: 'Document description',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    example: 'PENDING_APPROVAL',
    description: 'Document status',
    enum: DocumentStatus,
    required: false,
  })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiProperty({
    example: 'CONFIDENTIAL',
    description: 'Security level',
    enum: SecurityLevel,
    required: false,
  })
  @IsEnum(SecurityLevel)
  @IsOptional()
  securityLevel?: SecurityLevel;

  @ApiProperty({
    example: true,
    description: 'Is document confidential',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isConfidential?: boolean;

  @ApiProperty({
    example: 'cuid-department-id',
    description: 'Department ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({
    example: 'cuid-approver-id',
    description: 'Approver user ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  approverId?: string;

  @ApiProperty({
    example: ['tag1', 'tag2', 'tag3'],
    description: 'Document tags',
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
