import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth, 
  ApiOkResponse,
  ApiQuery,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OcrService } from './ocr.service';
import { OcrRequestDto } from './dto/ocr-request.dto';
import { AnalyzeDocumentDto, GetDocumentsForOcrDto } from './dto/analyze-document.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('AI OCR & Document Analysis')
@Controller('ocr')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth('access-token')
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('documents')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({ 
    summary: 'Get documents for OCR analysis (Admin/Manager only)',
    description: 'Retrieve a paginated list of documents that can be analyzed with AI OCR'
  })
  @ApiOkResponse({ 
    description: 'Documents retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  status: { type: 'string' },
                  fileUrl: { type: 'string' },
                  currentVersion: { type: 'object' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  owner: { type: 'object' },
                  tags: { type: 'array' },
                }
              }
            },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' },
          }
        }
      }
    }
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortOrder', required: false })
  async getDocumentsForOcr(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetDocumentsForOcrDto,
  ) {
    try {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';

      // Build where clause
      const where: any = {};
      
      if (query.status) {
        where.status = query.status;
      }
      
      if (query.search) {
        where.title = {
          contains: query.search,
          mode: 'insensitive',
        };
      }

      // Get documents with their latest versions
      const [documents, total] = await Promise.all([
        this.prisma.document.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            versions: {
              orderBy: {
                versionNumber: 'desc',
              },
              take: 1,
              select: {
                id: true,
                versionNumber: true,
                s3Key: true,
                s3Url: true,
                fileSize: true,
                mimeType: true,
                createdAt: true,
              },
            },
            creator: {
              select: {
                id: true,
                email: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
            tags: {
              select: {
                tag: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.document.count({ where }),
      ]);

      // Format response
      const formattedDocuments = documents.map((doc) => ({
        ...doc,
        latestVersion: doc.versions[0] || null,
        tags: doc.tags.map((t) => t.tag),
      }));

      return {
        success: true,
        message: 'Documents retrieved successfully',
        data: {
          documents: formattedDocuments,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve documents';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post('analyze')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Analyze document with AI OCR (Admin/Manager only)',
    description: 'Extract text using AWS Textract and generate AI summary using Claude 3.5 Sonnet'
  })
  @ApiOkResponse({ 
    description: 'Document analyzed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            documentId: { type: 'string' },
            extractedText: { type: 'string' },
            summary: { type: 'string' },
            confidence: { type: 'number' },
            pageCount: { type: 'number' },
            processingTime: { type: 'number' },
          }
        }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid document or analysis failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized access' })
  async analyzeDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Body() dto: AnalyzeDocumentDto,
  ) {
    try {
      // Get document and its latest version
      const document = await this.prisma.document.findUnique({
        where: { id: dto.documentId },
        include: {
          versions: {
            orderBy: {
              versionNumber: 'desc',
            },
            take: 1,
          },
        },
      });

      if (!document) {
        throw new BadRequestException('Document not found');
      }

      const latestVersion = document.versions[0];
      if (!latestVersion) {
        throw new BadRequestException('Document has no versions');
      }

      // Use s3Key if available, otherwise try to extract from s3Url
      let s3Key = latestVersion.s3Key;
      
      if (!s3Key && latestVersion.s3Url) {
        // Fallback: try to extract from s3Url
        const s3Url = latestVersion.s3Url;
        s3Key = s3Url.includes('amazonaws.com/') 
          ? s3Url.split('amazonaws.com/')[1].split('?')[0] // Remove query params
          : s3Url;
      }

      if (!s3Key) {
        throw new BadRequestException('Document has no S3 key or URL');
      }

      this.logger.log(`Analyzing document ${dto.documentId} with S3 key: ${s3Key}`);

      // Analyze document
      const result = await this.ocrService.analyzeDocument(dto.documentId, s3Key);

      return {
        success: true,
        message: 'Document analyzed successfully',
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Document analysis failed';
      throw new BadRequestException(errorMessage);
    }
  }

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
