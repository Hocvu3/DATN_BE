import { IsString, IsNumber, IsBoolean, IsOptional, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentVersionDto {
  @ApiProperty({ example: 1, description: 'Version number' })
  @IsNumber()
  @Min(1)
  versionNumber: number;

  @ApiProperty({ example: '/documents/project-requirements-v1.pdf', description: 'File path' })
  @IsString()
  @MaxLength(500)
  filePath: string;

  @ApiProperty({ example: 1024000, description: 'File size in bytes' })
  @IsNumber()
  @Min(1)
  fileSize: number;

  @ApiProperty({ example: 'a1b2c3d4e5f6...', description: 'File checksum for integrity verification' })
  @IsString()
  @MaxLength(128)
  checksum: string;

  @ApiProperty({ example: 'application/pdf', description: 'MIME type' })
  @IsString()
  @MaxLength(100)
  mimeType: string;

  @ApiProperty({ example: true, description: 'Is file encrypted', required: false })
  @IsBoolean()
  @IsOptional()
  isEncrypted?: boolean = true;

  @ApiProperty({ example: 'encrypted-key-reference', description: 'Encrypted key reference', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  encryptionKey?: string;
}
