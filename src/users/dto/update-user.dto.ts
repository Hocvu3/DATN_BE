import { IsString, IsEmail, IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'john.doe@company.com', description: 'Email address', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'johndoe', description: 'Username', required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ example: 'John', description: 'First name', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Doe', description: 'Last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ example: 'clm123456', description: 'Role ID', required: false })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiProperty({ example: 'clm123456', description: 'Department ID (null to remove from department)', required: false })
  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @ApiProperty({ example: true, description: 'Is user active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
