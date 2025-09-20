import { IsString, IsEmail, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterFromInvitationDto {
  @ApiProperty({ example: 'john.doe@company.com', description: 'Email address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'invitation-token-123', description: 'Invitation token' })
  @IsString()
  @IsNotEmpty()
  invitationToken!: string;

  @ApiProperty({ example: 'securePassword123', description: 'Password', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'securePassword123', description: 'Confirm password', minLength: 6 })
  @IsString()
  @MinLength(6)
  confirmPassword!: string;
}
