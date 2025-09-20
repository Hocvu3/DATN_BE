import { IsString, IsEmail, IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe@company.com', description: 'Email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  @IsString()
  username!: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: 'clm123456', description: 'Role ID' })
  @IsUUID()
  roleId!: string;

  @ApiProperty({ example: 'clm123456', description: 'Department ID', required: false })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ example: 'securePassword123', description: 'Password', minLength: 6 })
  @IsString()
  password!: string;

  @ApiProperty({ example: true, description: 'Is user active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
