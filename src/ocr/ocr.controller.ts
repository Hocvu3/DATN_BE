import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { OcrService } from './ocr.service';
import { OcrRequestDto } from './dto/ocr-request.dto';

@ApiTags('OCR')
@Controller('ocr')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perform OCR on document to extract text' })
  @ApiOkResponse({ description: 'OCR completed successfully' })
  async performOcr(@Body() ocrRequest: OcrRequestDto) {
    try {
      const result = await this.ocrService.performOcr(ocrRequest);
      
      return {
        success: true,
        message: 'OCR completed successfully',
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OCR processing failed';
      return {
        success: false,
        message: errorMessage,
        data: null,
      };
    }
  }

  @Get('languages')
  @ApiOperation({ summary: 'Get supported OCR languages' })
  @ApiOkResponse({ description: 'Supported languages retrieved' })
  getSupportedLanguages() {
    const languages = this.ocrService.getSupportedLanguages();
    
    return {
      success: true,
      message: 'Supported languages retrieved successfully',
      data: languages,
    };
  }
}
