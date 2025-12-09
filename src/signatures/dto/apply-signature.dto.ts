import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';

export class ApplySignatureDto {
  @ApiProperty({
    description: 'Document ID to apply signature to',
    example: 'clxyz123456789',
  })
  @IsNotEmpty()
  @IsString()
  documentId!: string;

  @ApiProperty({
    description: 'Signature stamp ID to apply',
    example: 'clxyz987654321',
  })
  @IsNotEmpty()
  @IsString()
  signatureStampId!: string;

  @ApiProperty({
    description: 'Reason for applying the signature',
    example: 'Document approved by management',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
