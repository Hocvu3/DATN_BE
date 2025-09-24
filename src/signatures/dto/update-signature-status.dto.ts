import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { $Enums, SignatureStatus } from '@prisma/client';

export class UpdateSignatureStatusDto {
  @ApiProperty({
    example: 'CANCELLED',
    description: 'New status for the signature request',
    enum: $Enums.SignatureStatus
  })
  @IsEnum($Enums.SignatureStatus)
  status!: SignatureStatus;

  @ApiProperty({
    example: 'Document content is not accurate',
    description: 'Reason for status change',
    required: false
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
