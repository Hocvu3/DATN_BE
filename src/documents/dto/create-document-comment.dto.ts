import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentCommentDto {
  @ApiProperty({ example: 'This document needs more details in section 3', description: 'Comment content' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @ApiProperty({ 
    example: false, 
    description: 'Is internal comment for approval workflow',
    required: false 
  })
  @IsBoolean()
  @IsOptional()
  isInternal?: boolean = false;
}
