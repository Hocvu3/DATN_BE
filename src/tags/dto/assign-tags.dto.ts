import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignTagsDto {
  @ApiProperty({
    example: ['tag-important', 'tag-urgent', 'tag-confidential'],
    description: 'Array of tag IDs to assign to the document',
    type: [String]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tagIds!: string[];
}
