import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OcrLanguage {
  ENGLISH = 'eng',
  VIETNAMESE = 'vie',
  CHINESE = 'chi_sim',
  JAPANESE = 'jpn',
}

export class OcrRequestDto {
  @ApiProperty({ description: 'Document ID or file URL to perform OCR on' })
  @IsString()
  fileSource!: string;

  @ApiPropertyOptional({ 
    description: 'OCR language', 
    enum: OcrLanguage, 
    default: OcrLanguage.VIETNAMESE 
  })
  @IsEnum(OcrLanguage)
  @IsOptional()
  language?: OcrLanguage;
}
