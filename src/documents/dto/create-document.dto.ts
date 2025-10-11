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
import { Type } from 'class-transformer';

export class CreateDocumentDto {
  @ApiProperty({ example: 'Project Requirements Document', description: 'Document title' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiProperty({
    example: 'This document outlines the requirements for the new project',
    description: 'Document description',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'DOC-2024-001', description: 'Unique document number' })
  @Type(() => String)
  @IsString()
  @MinLength(0)
  @MaxLength(5000)
  documentNumber?: string = `DOC-${Date.now()}`;

  @ApiProperty({
    example: 'DRAFT',
    description: 'Document status',
    enum: DocumentStatus,
    required: false,
  })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus = DocumentStatus.DRAFT;

  @ApiProperty({
    example: 'INTERNAL',
    description: 'Security level',
    enum: SecurityLevel,
    required: false,
  })
  @IsEnum(SecurityLevel)
  @IsOptional()
  securityLevel?: SecurityLevel = SecurityLevel.INTERNAL;

  @ApiProperty({
    example: false,
    description: 'Is document confidential',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isConfidential?: boolean = false;

  @ApiProperty({
    example: 'uuid-department-id',
    description: 'Department ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiProperty({
    example: 'uuid-approver-id',
    description: 'Approver user ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  approverId?: string;

  @ApiProperty({
    example: ['cmfpn65u70003vcqkodvmkj0y', 'cmfpn65tq0001vcqkb4qy7zu7'],
    description: 'Document tag IDs',
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
