import { IsOptional, IsString, IsEnum, IsNumber, Min, Max, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum SignatureStatus {
  PENDING = 'PENDING',
  SIGNED = 'SIGNED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
}

export enum SignatureType {
  ELECTRONIC = 'ELECTRONIC',
  DIGITAL = 'DIGITAL',
  BIOMETRIC = 'BIOMETRIC',
}

export class GetSignatureRequestsQueryDto {
  @ApiProperty({
    example: 'doc-version-123',
    description: 'Filter by document version ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  documentVersionId?: string;

  @ApiProperty({
    example: 'user-123',
    description: 'Filter by requester ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  requesterId?: string;

  @ApiProperty({
    example: 'PENDING',
    description: 'Filter by signature status',
    enum: SignatureStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(SignatureStatus)
  status?: SignatureStatus;

  @ApiProperty({
    example: 'ELECTRONIC',
    description: 'Filter by signature type',
    enum: SignatureType,
    required: false,
  })
  @IsOptional()
  @IsEnum(SignatureType)
  signatureType?: SignatureType;

  @ApiProperty({
    example: '2024-01-01',
    description: 'Filter by date from (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    example: '2024-12-31',
    description: 'Filter by date to (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiProperty({
    example: 1,
    description: 'Page number for pagination',
    required: false,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    example: 10,
    description: 'Number of items per page',
    required: false,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    example: 'requestedAt',
    description: 'Field to sort by',
    enum: ['requestedAt', 'expiresAt', 'signedAt', 'status'],
    required: false,
    default: 'requestedAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'requestedAt' | 'expiresAt' | 'signedAt' | 'status' = 'requestedAt';

  @ApiProperty({
    example: 'desc',
    description: 'Sort order',
    enum: ['asc', 'desc'],
    required: false,
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
