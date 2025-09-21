import { IsString, IsOptional, IsBoolean, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({
    example: 'Important',
    description: 'Name of the tag',
    maxLength: 50
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiProperty({
    example: '#FF5733',
    description: 'Color code for the tag (hex format)',
    required: false,
    maxLength: 7
  })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiProperty({
    example: 'This tag is used for important documents',
    description: 'Description of the tag',
    required: false,
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the tag is active',
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
