import { IsString, IsNumber, IsOptional, Min, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkAssetDto {
  @ApiProperty({
    example: 'documents/2024/01/15/project-requirements.pdf',
    description: 'S3 object key of the uploaded file',
  })
  @IsString()
  @IsNotEmpty()
  s3Key!: string;

  @ApiProperty({
    example: 'project-requirements.pdf',
    description: 'Original filename',
  })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({
    example: 'application/pdf',
    description: 'MIME type of the file',
  })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({
    example: 1024000,
    description: 'Size of the file in bytes (optional)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sizeBytes?: number;

  @ApiProperty({
    example: false,
    description: 'Mark this asset as cover image',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isCover?: boolean = false;
}
