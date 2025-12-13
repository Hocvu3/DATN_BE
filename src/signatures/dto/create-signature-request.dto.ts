import { IsString, IsEnum, IsDateString, IsOptional, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { $Enums, SignatureType } from '@prisma/client';

export class CreateSignatureRequestDto {
  @ApiProperty({
    example: 'doc-version-123',
    description: 'ID of the document version to be signed',
  })
  @IsString()
  @IsNotEmpty()
  documentVersionId!: string;

  @ApiProperty({
    example: 'ELECTRONIC',
    description: 'Type of signature',
    enum: $Enums.SignatureType,
  })
  @IsEnum($Enums.SignatureType)
  signatureType!: SignatureType;

  @ApiProperty({
    example: '2024-12-31T23:59:59.000Z',
    description: 'Expiration date for the signature request',
  })
  @IsDateString()
  expiresAt!: string;

  @ApiProperty({
    example: 'This document requires approval for the quarterly report',
    description: 'Reason for requesting signature',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
