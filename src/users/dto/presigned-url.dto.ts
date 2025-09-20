import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignedUrlDto {
  @ApiProperty({ example: 'avatar.jpg', description: 'File name' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg', description: 'File content type' })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({
    example: 1024000,
    description: 'File size in bytes',
    required: false,
    type: Number,
  })
  @IsOptional()
  fileSize?: number;
}
