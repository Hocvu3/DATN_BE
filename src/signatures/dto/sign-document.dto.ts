import { IsString, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CertificateInfoDto {
  @ApiProperty({ example: 'Certificate Authority' })
  @IsString()
  issuer!: string;

  @ApiProperty({ example: 'CN=John Doe, O=Company' })
  @IsString()
  subject!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @IsString()
  validFrom!: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsString()
  validTo!: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  serialNumber!: string;

  @ApiProperty({ example: 'RSA-SHA256' })
  @IsString()
  algorithm!: string;
}

export class SignDocumentDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Encrypted signature data (base64 encoded)',
  })
  @IsString()
  @IsNotEmpty()
  signatureData!: string;

  @ApiProperty({
    example: {
      issuer: 'Certificate Authority',
      subject: 'CN=John Doe, O=Company',
      validFrom: '2024-01-01T00:00:00.000Z',
      validTo: '2025-01-01T00:00:00.000Z',
      serialNumber: '1234567890',
      algorithm: 'RSA-SHA256',
    },
    description: 'Certificate information',
    type: () => CertificateInfoDto,
  })
  @ValidateNested()
  @Type(() => CertificateInfoDto)
  certificateInfo!: CertificateInfoDto;

  @ApiProperty({
    example: '192.168.1.100',
    description: 'IP address of the signer',
    required: false,
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiProperty({
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    description: 'User agent of the signer',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}
