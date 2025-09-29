import { IsString, IsNumber, IsOptional, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignedUrlDto {
  @ApiProperty({
    example: 'project-requirements.pdf',
    description: 'Name of the file to upload',
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

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
  fileSize?: number;
}
