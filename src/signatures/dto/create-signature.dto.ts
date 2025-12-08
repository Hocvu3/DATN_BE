import { IsString, IsOptional, IsNotEmpty, MaxLength, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSignatureDto {
  @ApiProperty({
    example: 'CEO Signature',
    description: 'Name/label of the signature stamp',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'Official signature stamp for CEO documents',
    description: 'Description of the signature stamp',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'https://s3.amazonaws.com/bucket/signatures/uuid.png',
    description: 'S3 URL of the signature image',
  })
  @IsString()
  @IsNotEmpty()
  imageUrl!: string;

  @ApiProperty({
    example: 'signatures/uuid.png',
    description: 'S3 object key',
  })
  @IsString()
  @IsNotEmpty()
  s3Key!: string;
}
