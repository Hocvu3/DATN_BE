import { IsOptional, IsString, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetTagsQueryDto {
  @ApiProperty({
    example: 'important',
    description: 'Search term for tag name or description',
    required: false
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    example: true,
    description: 'Filter by active status',
    required: false
  })
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    example: 1,
    description: 'Page number for pagination',
    required: false,
    minimum: 1,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    example: 10,
    description: 'Number of items per page',
    required: false,
    minimum: 1,
    maximum: 100,
    default: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    example: 'name',
    description: 'Field to sort by (name, createdAt, documentCount)',
    required: false,
    enum: ['name', 'createdAt', 'documentCount'],
    default: 'name'
  })
  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'createdAt' | 'documentCount' = 'name';

  @ApiProperty({
    example: 'asc',
    description: 'Sort order',
    required: false,
    enum: ['asc', 'desc'],
    default: 'asc'
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}
