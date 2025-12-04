import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class GetUsersQueryDto {
  @ApiProperty({ example: 1, description: 'Page number', required: false, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 1;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 1 : parsed;
  })
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 10, description: 'Items per page', required: false, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 10;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 10 : parsed;
  })
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({ example: 'john', description: 'Search by name or email', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ example: 'johndoe', description: 'Search by username', required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ example: 'ADMIN', description: 'Filter by role name', required: false })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ example: 'uuid-role-id', description: 'Filter by role ID', required: false })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiProperty({ example: 'IT', description: 'Filter by department name', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: 'uuid-dept-id', description: 'Filter by department ID', required: false })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({ example: true, description: 'Filter by active status', required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isActive?: boolean;

  @ApiProperty({ example: 'firstName', description: 'Sort by field', required: false })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ example: 'ASC', description: 'Sort order (ASC or DESC)', required: false })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}
