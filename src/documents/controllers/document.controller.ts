import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
  Res,
  StreamableFile,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { DocumentService } from '../services/document.service';
import { S3Service } from '../../s3/s3.service';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { CreateDocumentVersionDto } from '../dto/create-document-version.dto';
import { CreateDocumentCommentDto } from '../dto/create-document-comment.dto';
import { GetDocumentsQueryDto } from '../dto/get-documents-query.dto';
import { PresignedUrlDto } from '../dto/presigned-url.dto';
import { LinkAssetDto } from '../dto/link-asset.dto';
import { LinkCoverAssetDto } from '../dto/link-cover-asset.dto';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('Documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    private readonly documentService: DocumentService,
    private readonly s3Service: S3Service,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  @ApiOkResponse({ description: 'Document created successfully' })
  async createDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createDocumentDto: CreateDocumentDto,
  ) {
    try {
      const document = await this.documentService.createDocument(
        req.user.userId,
        createDocumentDto,
      );
      return {
        message: 'Document created successfully',
        document: {
          id: document.id,
          title: document.title,
          description: document.description,
          documentNumber: document.documentNumber,
          status: document.status,
          securityLevel: document.securityLevel,
          isConfidential: document.isConfidential,
          creator: {
            id: document.creator.id,
            email: document.creator.email,
            firstName: document.creator.firstName,
            lastName: document.creator.lastName,
          },
          approver: document.approver
            ? {
              id: document.approver.id,
              email: document.approver.email,
              firstName: document.approver.firstName,
              lastName: document.approver.lastName,
            }
            : null,
          department: document.department
            ? {
              id: document.department.id,
              name: document.department.name,
            }
            : null,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get documents with pagination and filters' })
  @ApiOkResponse({ description: 'Documents retrieved successfully' })
  async getDocuments(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetDocumentsQueryDto,
  ) {
    try {
      const result = await this.documentService.getDocuments(req.user.userId, req.user.role, query);
      return {
        message: 'Documents retrieved successfully',
        ...result,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiOkResponse({ description: 'Document retrieved successfully' })
  async getDocumentById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      const document = await this.documentService.getDocumentById(
        id,
        req.user.userId,
        req.user.role,
      );
      return {
        message: 'Document retrieved successfully',
        document,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update document' })
  @ApiOkResponse({ description: 'Document updated successfully' })
  async updateDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ) {
    try {
      const document = await this.documentService.updateDocument(
        id,
        req.user.userId,
        req.user.role,
        updateDocumentDto,
      );
      return {
        message: 'Document updated successfully',
        document,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete document (Admin only)' })
  @ApiOkResponse({ description: 'Document deleted successfully' })
  async deleteDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      await this.documentService.deleteDocument(id, req.user.userId, req.user.role);
      return {
        message: 'Document deleted successfully',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  // ===== DOCUMENT VERSIONS =====
  @Post(':id/versions/presigned-url')
  @ApiOperation({
    summary: 'Generate presigned URL for document version upload',
    description:
      'Generate a presigned URL for uploading a new version of a document to S3. After upload, call POST /documents/:id/versions to create the version record.',
  })
  @ApiOkResponse({
    description: 'Presigned URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        presignedUrl: {
          type: 'string',
          description: 'Presigned URL for uploading version file to S3',
          example:
            'https://your-bucket.s3.amazonaws.com/documents/versions/2024/01/15/document-v2.pdf?X-Amz-Algorithm=...',
        },
        key: {
          type: 'string',
          description: 'S3 object key for the version file',
          example: 'documents/versions/2024/01/15/document-v2.pdf',
        },
        publicUrl: {
          type: 'string',
          description: 'Public URL to access the version file',
          example:
            'https://your-bucket.s3.amazonaws.com/documents/versions/2024/01/15/document-v2.pdf',
        },
        message: {
          type: 'string',
          description: 'Success message with next steps',
          example:
            'Upload version file to presigned URL, then call POST /documents/:id/versions to create version record',
        },
      },
    },
  })
  async generateVersionPresignedUrl(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: PresignedUrlDto,
  ) {
    try {
      // Check if document exists
      const document = await this.documentService.getDocumentById(
        id,
        req.user.userId,
        req.user.role,
      );

      // Generate presigned URL for version upload
      const { presignedUrl, key, publicUrl } = await this.s3Service.generatePresignedUrl(
        body.fileName,
        body.contentType,
        'documents/versions',
      );

      return {
        presignedUrl,
        key,
        publicUrl,
        message:
          'Upload version file to presigned URL, then call POST /documents/:id/versions to create version record',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post(':id/versions')
  @ApiOperation({
    summary: 'Create document version',
    description:
      'Create a new version record for a document. Use this after uploading the version file via presigned URL.',
  })
  @ApiOkResponse({ description: 'Document version created successfully' })
  async createDocumentVersion(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() createVersionDto: CreateDocumentVersionDto,
  ) {
    try {
      const version = await this.documentService.createDocumentVersion(
        id,
        req.user.userId,
        createVersionDto,
      );
      return {
        message: 'Document version created successfully',
        version,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'Get document versions',
    description:
      'Get all versions of a document with their S3 URLs and metadata. Each version has its own S3 URL for accessing the file.',
  })
  @ApiOkResponse({
    description: 'Document versions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Document versions retrieved successfully',
        },
        versions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'version-uuid' },
              versionNumber: { type: 'number', example: 1 },
              filePath: { type: 'string', example: '/documents/file.pdf' },
              s3Key: { type: 'string', example: 'documents/versions/2024/01/15/file-v1.pdf' },
              s3Url: {
                type: 'string',
                example: 'https://bucket.s3.amazonaws.com/documents/versions/file-v1.pdf',
              },
              fileSize: { type: 'number', example: 1024000 },
              checksum: { type: 'string', example: 'a1b2c3d4e5f6...' },
              mimeType: { type: 'string', example: 'application/pdf' },
              isEncrypted: { type: 'boolean', example: true },
              createdAt: { type: 'string', format: 'date-time' },
              creator: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  async getDocumentVersions(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      // Check document access first
      await this.documentService.getDocumentById(id, req.user.userId, req.user.role);

      const versions = await this.documentService.getDocumentVersions(id);
      return {
        message: 'Document versions retrieved successfully',
        versions,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id/versions/:versionNumber')
  @ApiOperation({
    summary: 'Get specific document version',
    description:
      'Get a specific version of a document by version number with its S3 URL for file access',
  })
  @ApiOkResponse({
    description: 'Document version retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Document version retrieved successfully',
        },
        version: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'version-uuid' },
            versionNumber: { type: 'number', example: 2 },
            filePath: { type: 'string', example: '/documents/file.pdf' },
            s3Key: { type: 'string', example: 'documents/versions/2024/01/15/file-v2.pdf' },
            s3Url: {
              type: 'string',
              example: 'https://bucket.s3.amazonaws.com/documents/versions/file-v2.pdf',
            },
            fileSize: { type: 'number', example: 1024000 },
            checksum: { type: 'string', example: 'a1b2c3d4e5f6...' },
            mimeType: { type: 'string', example: 'application/pdf' },
            isEncrypted: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            creator: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
              },
            },
          },
        },
      },
    },
  })
  async getDocumentVersion(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    try {
      // Check document access first
      await this.documentService.getDocumentById(id, req.user.userId, req.user.role);

      const version = await this.documentService.getDocumentVersion(id, parseInt(versionNumber));
      return {
        message: 'Document version retrieved successfully',
        version,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id/versions/latest')
  @ApiOperation({
    summary: 'Get latest document version',
    description: 'Get the latest version of a document with its S3 URL for file access',
  })
  @ApiOkResponse({
    description: 'Latest document version retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Latest document version retrieved successfully',
        },
        version: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'version-uuid' },
            versionNumber: { type: 'number', example: 3 },
            filePath: { type: 'string', example: '/documents/file.pdf' },
            s3Key: { type: 'string', example: 'documents/versions/2024/01/15/file-v3.pdf' },
            s3Url: {
              type: 'string',
              example: 'https://bucket.s3.amazonaws.com/documents/versions/file-v3.pdf',
            },
            fileSize: { type: 'number', example: 1024000 },
            checksum: { type: 'string', example: 'a1b2c3d4e5f6...' },
            mimeType: { type: 'string', example: 'application/pdf' },
            isEncrypted: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            creator: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
              },
            },
          },
        },
      },
    },
  })
  async getLatestDocumentVersion(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      // Check document access first
      await this.documentService.getDocumentById(id, req.user.userId, req.user.role);

      const version = await this.documentService.getLatestDocumentVersion(id);
      return {
        message: 'Latest document version retrieved successfully',
        version,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Delete(':id/versions/:versionNumber')
  @ApiOperation({
    summary: 'Delete document version',
    description:
      'Delete a specific version of a document. This will remove the version from database and delete the file from S3. Cannot delete the last remaining version.',
  })
  @ApiOkResponse({
    description: 'Document version deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Document version deleted successfully',
        },
        deletedVersion: {
          type: 'object',
          properties: {
            versionNumber: { type: 'number', example: 2 },
            s3Key: { type: 'string', example: 'documents/versions/2024/01/15/file-v2.pdf' },
            deletedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async deleteDocumentVersion(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    try {
      await this.documentService.deleteDocumentVersion(
        id,
        parseInt(versionNumber),
        req.user.userId,
        req.user.role,
      );

      return {
        message: 'Document version deleted successfully',
        deletedVersion: {
          versionNumber: parseInt(versionNumber),
          deletedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  // ===== DOCUMENT COMMENTS =====
  @Post(':id/comments')
  @ApiOperation({ summary: 'Add comment to document' })
  @ApiOkResponse({ description: 'Comment added successfully' })
  async createDocumentComment(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() createCommentDto: CreateDocumentCommentDto,
  ) {
    try {
      const comment = await this.documentService.createDocumentComment(
        id,
        req.user.userId,
        createCommentDto,
      );
      return {
        message: 'Comment added successfully',
        comment,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get document comments' })
  @ApiOkResponse({ description: 'Document comments retrieved successfully' })
  async getDocumentComments(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      const comments = await this.documentService.getDocumentComments(id);
      return {
        message: 'Document comments retrieved successfully',
        comments,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  // ===== DOCUMENT ASSETS =====
  @Post(':id/assets/presigned-url')
  @ApiOperation({
    summary: 'Generate presigned URL for document asset upload',
    description:
      'Generate a presigned URL for uploading files to S3. The frontend can use this URL to upload files directly to S3 without going through the backend. After upload, call POST /documents/:id/assets to link the uploaded file to the document.',
  })
  @ApiOkResponse({
    description: 'Presigned URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        presignedUrl: {
          type: 'string',
          description: 'Presigned URL for uploading file to S3',
          example:
            'https://your-bucket.s3.amazonaws.com/documents/2024/01/15/document-file.pdf?X-Amz-Algorithm=...',
        },
        key: {
          type: 'string',
          description: 'S3 object key for the uploaded file',
          example: 'documents/2024/01/15/document-file.pdf',
        },
        publicUrl: {
          type: 'string',
          description: 'Public URL to access the uploaded file',
          example: 'https://your-bucket.s3.amazonaws.com/documents/2024/01/15/document-file.pdf',
        },
        message: {
          type: 'string',
          description: 'Success message with next steps',
          example:
            'Upload file to presigned URL, then call POST /documents/:id/assets to link to document',
        },
      },
    },
  })
  async generateAssetPresignedUrl(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: PresignedUrlDto,
  ) {
    try {

      // Check if document exists
      await this.documentService.getDocumentById(id, req.user.userId, req.user.role);


      const { presignedUrl, key, publicUrl } = await this.s3Service.generateDocumentPresignedUrl(
        body.fileName,
        body.contentType,
      );

      return {
        presignedUrl,
        key,
        publicUrl,
        message:
          'Upload file to presigned URL, then call POST /documents/:id/assets to link to document',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post(':id/assets/cover/presigned-url')
  @ApiOperation({
    summary: 'Generate presigned URL for document cover image upload',
    description:
      'Generate a presigned URL for uploading cover images to S3. The frontend can use this URL to upload cover images directly to S3 without going through the backend. After upload, call POST /documents/:id/assets/cover to link the uploaded cover image to the document.',
  })
  @ApiOkResponse({
    description: 'Presigned URL generated successfully for cover image',
    schema: {
      type: 'object',
      properties: {
        presignedUrl: {
          type: 'string',
          description: 'Presigned URL for uploading cover image to S3',
          example:
            'https://your-bucket.s3.amazonaws.com/documents/covers/2024/01/15/cover-image.jpg?X-Amz-Algorithm=...',
        },
        key: {
          type: 'string',
          description: 'S3 object key for the uploaded cover image',
          example: 'documents/covers/2024/01/15/cover-image.jpg',
        },
        publicUrl: {
          type: 'string',
          description: 'Public URL to access the uploaded cover image',
          example: 'https://your-bucket.s3.amazonaws.com/documents/covers/2024/01/15/cover-image.jpg',
        },
        message: {
          type: 'string',
          description: 'Success message with next steps',
          example:
            'Upload cover image to presigned URL, then call POST /documents/:id/assets/cover to link to document',
        },
      },
    },
  })
  async generateCoverPresignedUrl(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: PresignedUrlDto,
  ) {
    try {
      // Validate that it's an image
      if (!body.contentType.startsWith('image/')) {
        throw new BadRequestException('Cover files must be image files');
      }

      // Check if document exists
      await this.documentService.getDocumentById(id, req.user.userId, req.user.role);

      // Generate presigned URL for cover upload
      const { presignedUrl, key, publicUrl } = await this.s3Service.generateCoverPresignedUrl(
        body.fileName,
        body.contentType,
      );

      return {
        presignedUrl,
        key,
        publicUrl,
        message:
          'Upload cover image to presigned URL, then call POST /documents/:id/assets/cover to link to document',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post(':id/assets')
  @ApiOperation({
    summary: 'Link uploaded file to document',
    description:
      'Link an already uploaded file (via presigned URL) to a document. This creates an asset record in the database.',
  })
  @ApiOkResponse({
    description: 'File linked to document successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'File linked to document successfully',
        },
        asset: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'asset-uuid' },
            filename: { type: 'string', example: 'project-requirements.pdf' },
            s3Url: {
              type: 'string',
              example: 'https://bucket.s3.amazonaws.com/documents/file.pdf',
            },
            contentType: { type: 'string', example: 'application/pdf' },
            sizeBytes: { type: 'number', example: 1024000 },
            isCover: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async linkAssetToDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: LinkAssetDto,
  ) {
    try {
      // Use the enhanced service method that supports cover images
      const asset = await this.documentService.linkDocumentAssetWithCover(id, req.user.userId, {
        s3Key: body.s3Key,
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        isCover: body.isCover || false,
      });

      return {
        message: body.isCover ? 'Cover image linked to document successfully' : 'File linked to document successfully',
        asset: {
          id: asset.id,
          filename: asset.filename,
          s3Url: asset.s3Url,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes ? Number(asset.sizeBytes) : null,
          isCover: asset.isCover,
          createdAt: asset.createdAt,
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Post(':id/assets/cover')
  @ApiOperation({
    summary: 'Link uploaded cover image to document',
    description:
      'Link an already uploaded cover image (via presigned URL) to a document. This creates a cover asset record in the database and marks it as the document cover.',
  })
  @ApiOkResponse({
    description: 'Cover image linked to document successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Cover image linked to document successfully',
        },
        asset: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'asset-uuid' },
            filename: { type: 'string', example: 'cover-image.jpg' },
            s3Url: {
              type: 'string',
              example: 'https://bucket.s3.amazonaws.com/documents/covers/cover-image.jpg',
            },
            contentType: { type: 'string', example: 'image/jpeg' },
            sizeBytes: { type: 'number', example: 512000 },
            isCover: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async linkAssetCoverToDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: LinkCoverAssetDto,
  ) {
    try {
      // Validate that it's an image
      if (!body.contentType.startsWith('image/')) {
        throw new BadRequestException('Cover asset must be an image file');
      }

      // Use the enhanced service method for cover images
      const asset = await this.documentService.linkDocumentAssetWithCover(id, req.user.userId, {
        s3Key: body.s3Key,
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        isCover: true, // Always true for cover endpoint
      });

      return {
        message: 'Cover image linked to document successfully',
        asset: {
          id: asset.id,
          filename: asset.filename,
          s3Url: asset.s3Url,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes ? Number(asset.sizeBytes) : null,
          isCover: asset.isCover,
          createdAt: asset.createdAt,
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id/cover')
  @ApiOperation({
    summary: 'Get document cover image',
    description: 'Get the cover image of a document if exists',
  })
  @ApiOkResponse({
    description: 'Document cover retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Document cover retrieved successfully',
        },
        cover: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'asset-uuid' },
            filename: { type: 'string', example: 'cover-image.jpg' },
            s3Url: {
              type: 'string',
              example: 'https://bucket.s3.amazonaws.com/documents/covers/cover-image.jpg',
            },
            contentType: { type: 'string', example: 'image/jpeg' },
            sizeBytes: { type: 'number', example: 512000 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async getDocumentCover(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      // Check document access first
      await this.documentService.getDocumentById(id, req.user.userId, req.user.role);

      const cover = await this.documentService.getDocumentCover(id);

      if (!cover) {
        return {
          message: 'No cover image found for this document',
          cover: null,
        };
      }

      return {
        message: 'Document cover retrieved successfully',
        cover: {
          id: cover.id,
          filename: cover.filename,
          s3Url: cover.s3Url,
          contentType: cover.contentType,
          sizeBytes: cover.sizeBytes ? Number(cover.sizeBytes) : null,
          createdAt: cover.createdAt,
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Get(':id/assets')
  @ApiOperation({
    summary: 'Get document assets',
    description: 'Get all assets (uploaded files) associated with a document',
  })
  @ApiOkResponse({
    description: 'Document assets retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Document assets retrieved successfully',
        },
        assets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'asset-uuid' },
              filename: { type: 'string', example: 'project-requirements.pdf' },
              s3Url: {
                type: 'string',
                example: 'https://bucket.s3.amazonaws.com/documents/file.pdf',
              },
              contentType: { type: 'string', example: 'application/pdf' },
              sizeBytes: { type: 'number', example: 1024000 },
              isCover: { type: 'boolean', example: false },
              createdAt: { type: 'string', format: 'date-time' },
              uploadedBy: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  })
  async getDocumentAssets(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
      const document = await this.documentService.getDocumentById(
        id,
        req.user.userId,
        req.user.role,
      );
      const assets = await this.documentService.getDocumentAssets(id);
      return {
        message: 'Document assets retrieved successfully',
        assets,
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  @Delete(':id/assets/:assetId')
  @ApiOperation({
    summary: 'Delete document asset',
    description:
      'Delete a specific asset (attached file) from a document. This will remove the asset from database and delete the file from S3.',
  })
  @ApiOkResponse({
    description: 'Document asset deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Document asset deleted successfully',
        },
        deletedAsset: {
          type: 'object',
          properties: {
            assetId: { type: 'string', example: 'asset-uuid' },
            filename: { type: 'string', example: 'attachment.pdf' },
            deletedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async deleteDocumentAsset(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ) {
    try {
      await this.documentService.deleteDocumentAsset(id, assetId, req.user.userId, req.user.role);

      return {
        message: 'Document asset deleted successfully',
        deletedAsset: {
          assetId,
          deletedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }

  // ===== FILE SERVING APIs =====
  @Get('files/view/:keyPath')
  @ApiOperation({
    summary: 'View file from S3',
    description: 'Stream file content from S3 storage through backend to display in browser. Requires authentication.',
  })
  async viewFile(
    @Req() req: { user: { userId: string; role: string } },
    @Param('keyPath') keyPath: string,
    @Res() res: Response,
  ) {
    try {
      const key = decodeURIComponent(keyPath);
      this.logger.log(`Viewing file: ${key}`);

      const fileData = await this.s3Service.getFile(key);

      // Extract filename and ensure it's properly formatted
      const filename = key.split('/').pop() || 'document.pdf';
      this.logger.log(`View - Key: ${key}, Extracted filename: ${filename}`);

      // Get buffer
      let buffer: Buffer;
      if (Buffer.isBuffer(fileData.body)) {
        buffer = fileData.body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of fileData.body as any) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
      }

      this.logger.log(`View - Buffer size: ${buffer.length}`);

      // Set headers and send buffer directly
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache');

      // Send the buffer directly
      res.send(buffer);

    } catch (error) {
      this.logger.error(`Failed to serve file: ${keyPath}`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(400).json({ error: `File not found: ${errorMessage}` });
    }
  }

  @Get('files/download/:keyPath')
  @ApiOperation({
    summary: 'Download file from S3',
    description: 'Download file from S3 storage through backend with proper headers. Requires authentication.',
  })
  async downloadFile(
    @Req() req: { user: { userId: string; role: string } },
    @Param('keyPath') keyPath: string,
    @Res() res: Response,
  ) {
    try {
      const key = decodeURIComponent(keyPath);
      this.logger.log(`Downloading file: ${key}`);

      const fileData = await this.s3Service.getFile(key);

      // Extract filename and ensure it's properly formatted
      const filename = key.split('/').pop() || 'download.pdf';
      this.logger.log(`Download - Key: ${key}, Extracted filename: ${filename}`);

      // Get buffer
      let buffer: Buffer;
      if (Buffer.isBuffer(fileData.body)) {
        buffer = fileData.body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of fileData.body as any) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
      }

      this.logger.log(`Download - Buffer size: ${buffer.length}`);

      // Set headers and send buffer directly
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      // Send the buffer directly
      res.send(buffer);

    } catch (error) {
      this.logger.error(`Failed to download file: ${keyPath}`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(400).json({ error: `File not found: ${errorMessage}` });
    }
  }
}
