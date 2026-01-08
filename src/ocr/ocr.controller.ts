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
  Param,
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
  ApiParam,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OcrService } from './ocr.service';
import { OcrRequestDto } from './dto/ocr-request.dto';
import { AnalyzeDocumentDto, GetDocumentsForOcrDto } from './dto/analyze-document.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SignatureService } from '../signatures/services/signature.service';
import { SignatureStampsService } from '../signatures/services/signature-stamps.service';
import { DocumentStatus } from '@prisma/client';

@ApiTags('AI OCR & Document Analysis')
@Controller('ocr')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth('access-token')
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly prisma: PrismaService,
    private readonly signatureService: SignatureService,
    private readonly signatureStampsService: SignatureStampsService,
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
      // Get document
      const document = await this.prisma.document.findUnique({
        where: { id: dto.documentId },
      });

      if (!document) {
        throw new BadRequestException('Document not found');
      }

      // Get specific version or latest version
      let targetVersion;
      if (dto.versionId) {
        targetVersion = await this.prisma.documentVersion.findUnique({
          where: { id: dto.versionId },
        });
        if (!targetVersion || targetVersion.documentId !== dto.documentId) {
          throw new BadRequestException('Version not found or does not belong to this document');
        }
      } else {
        targetVersion = await this.prisma.documentVersion.findFirst({
          where: { documentId: dto.documentId },
          orderBy: { versionNumber: 'desc' },
        });
      }

      if (!targetVersion) {
        throw new BadRequestException('Document has no versions');
      }

      // Use s3Key if available, otherwise try to extract from s3Url
      let s3Key = targetVersion.s3Key;
      
      if (!s3Key && targetVersion.s3Url) {
        // Fallback: try to extract from s3Url
        const s3Url = targetVersion.s3Url;
        s3Key = s3Url.includes('amazonaws.com/') 
          ? s3Url.split('amazonaws.com/')[1].split('?')[0] // Remove query params
          : s3Url;
      }

      if (!s3Key) {
        throw new BadRequestException('Document has no S3 key or URL');
      }

      // Validate file format before analysis
      const fileExtension = s3Key.split('.').pop()?.toLowerCase();
      const supportedFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'];
      
      if (!fileExtension || !supportedFormats.includes(fileExtension)) {
        throw new BadRequestException(
          `Cannot analyze ${fileExtension || 'unknown'} files. AI OCR only supports: ${supportedFormats.join(', ')}. ` +
          `Please convert your document to PDF or image format before analyzing.`
        );
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

  @Post('documents/:documentId/approve')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve document after AI analysis (Admin/Manager only)',
    description: 'Approve document and optionally apply digital signature with watermark',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID', type: 'string' })
  @ApiOkResponse({ description: 'Document approved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid document or approval failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized access' })
  async approveDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('documentId') documentId: string,
    @Body() body: { versionId?: string; signatureStampId?: string; reason?: string; type?: number },
  ) {
    try {
      // Get document
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new BadRequestException('Document not found');
      }

      // Get specific version or latest version
      let targetVersion;
      if (body.versionId) {
        targetVersion = await this.prisma.documentVersion.findUnique({
          where: { id: body.versionId },
        });
        if (!targetVersion || targetVersion.documentId !== documentId) {
          throw new BadRequestException('Version not found or does not belong to this document');
        }
      } else {
        targetVersion = await this.prisma.documentVersion.findFirst({
          where: { documentId: documentId },
          orderBy: { versionNumber: 'desc' },
        });
      }

      if (!targetVersion) {
        throw new BadRequestException('Document has no versions');
      }

      let result: any;

      // If signatureStampId is provided, apply watermark and create/update signature request
      if (body.signatureStampId) {
        result = await this.signatureStampsService.applySignatureStamp(
          {
            documentId: documentId,
            signatureStampId: body.signatureStampId,
            reason: body.reason || 'Approved after AI analysis',
            type: body.type || 2, // Default to type 2 for hash generation
          },
          req.user.userId,
          req.user.role,
        );

        return {
          success: true,
          message: 'Document approved with signature watermark',
          data: {
            documentId,
            versionId: targetVersion.id,
            digitalSignature: result,
          },
        };
      } else {
        // Just approve without watermark - find or create signature request
        let signatureRequest = await this.prisma.signatureRequest.findFirst({
          where: {
            documentVersionId: targetVersion.id,
          },
        });

        if (signatureRequest) {
          // Update existing signature request
          signatureRequest = await this.prisma.signatureRequest.update({
            where: { id: signatureRequest.id },
            data: {
              status: 'SIGNED',
              signedAt: new Date(),
            },
          });
        } else {
          // Create new signature request
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          
          signatureRequest = await this.prisma.signatureRequest.create({
            data: {
              documentVersion: { connect: { id: targetVersion.id } },
              requester: { connect: { id: req.user.userId } },
              signatureType: 'DIGITAL',
              expiresAt: expiresAt,
              status: 'SIGNED',
              signedAt: new Date(),
              reason: body.reason || 'Approved after AI analysis',
            },
          });
        }

        // Update version status to APPROVED
        await this.prisma.documentVersion.update({
          where: { id: targetVersion.id },
          data: { status: 'APPROVED' },
        });

        return {
          success: true,
          message: 'Document approved successfully',
          data: {
            documentId,
            versionId: targetVersion.id,
            signatureRequest,
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Document approval failed';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post('documents/:documentId/reject')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject document after AI analysis (Admin/Manager only)',
    description: 'Reject document and update/delete signature request and digital signatures',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID', type: 'string' })
  @ApiOkResponse({ description: 'Document rejected successfully' })
  @ApiBadRequestResponse({ description: 'Invalid document or rejection failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized access' })
  async rejectDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('documentId') documentId: string,
    @Body() body: { versionId?: string; reason: string },
  ) {
    try {
      // Get document
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new BadRequestException('Document not found');
      }

      // Get specific version or latest version
      let targetVersion;
      if (body.versionId) {
        targetVersion = await this.prisma.documentVersion.findUnique({
          where: { id: body.versionId },
        });
        if (!targetVersion || targetVersion.documentId !== documentId) {
          throw new BadRequestException('Version not found or does not belong to this document');
        }
      } else {
        targetVersion = await this.prisma.documentVersion.findFirst({
          where: { documentId: documentId },
          orderBy: { versionNumber: 'desc' },
        });
      }

      if (!targetVersion) {
        throw new BadRequestException('Document has no versions');
      }

      // Find signature request for this version
      const signatureRequest = await this.prisma.signatureRequest.findFirst({
        where: {
          documentVersionId: targetVersion.id,
        },
      });

      if (signatureRequest) {
        // Use the reject logic from signature service
        await this.signatureService.rejectSignatureRequest(
          signatureRequest.id,
          body.reason,
          req.user.userId,
          req.user.role,
        );
      } else {
        // No signature request exists, just update version status to PENDING_APPROVAL
        await this.prisma.documentVersion.update({
          where: { id: targetVersion.id },
          data: { status: DocumentStatus.PENDING_APPROVAL },
        });
      }

      return {
        success: true,
        message: 'Document rejected successfully',
        data: {
          documentId,
          versionId: targetVersion.id,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Document rejection failed';
      throw new BadRequestException(errorMessage);
    }
  }
}
