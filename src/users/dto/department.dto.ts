import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateDepartmentDto {
    @ApiProperty({ description: 'Department name', example: 'IT Department' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional({ description: 'Department description', example: 'Information Technology Department' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Is department active', example: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class UpdateDepartmentDto {
    @ApiPropertyOptional({ description: 'Department name', example: 'IT Department' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'Department description', example: 'Information Technology Department' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Is department active', example: true })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}