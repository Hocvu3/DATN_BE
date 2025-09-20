import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendInvitationDto {
  @ApiProperty({ 
    example: 'hocvt2@vmogroup.com', 
    description: 'Email address of the user to resend invitation to' 
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
