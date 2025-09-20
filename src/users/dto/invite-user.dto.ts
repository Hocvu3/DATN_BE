import { IsString, IsEmail, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({ example: 'hocvt2@vmogoup.com', description: 'Email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  @IsString()
  username!: string;

  @ApiProperty({ example: 'role-employee', description: 'Role ID' })
  @IsUUID()
  roleId!: string;

  @ApiProperty({ example: 'dept-sales', description: 'Department ID', required: false })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ example: 'Welcome to our document management system!', description: 'Invitation message', required: false })
  @IsOptional()
  @IsString()
  message?: string;
}
