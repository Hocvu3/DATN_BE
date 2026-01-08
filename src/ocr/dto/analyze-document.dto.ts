import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeDocumentDto {
  @ApiProperty({ 
    description: 'Document ID from database',
    example: 'cm123abc456def'
  })
  @IsString()
  documentId!: string;

  @ApiPropertyOptional({ 
    description: 'Specific version ID to analyze (if not provided, uses latest version)',
    example: 'cm123abc456ver'
  })
  @IsString()
  @IsOptional()
  versionId?: string;
}

export class GetDocumentsForOcrDto {
  @ApiPropertyOptional({ 
    description: 'Filter by document status',
    enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'],
  })
  @IsEnum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ 
    description: 'Search by document title',
    example: 'Contract'
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Page number for pagination',
    example: 1,
    default: 1
  })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ 
    description: 'Items per page',
    example: 20,
    default: 20
  })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ 
    description: 'Sort by field',
    enum: ['createdAt', 'updatedAt', 'title'],
    default: 'createdAt'
  })
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ 
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc'
  })
  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}
