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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { DocumentService } from '../services/document.service';
import { S3Service } from '../../s3/s3.service';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { CreateDocumentVersionDto } from '../dto/create-document-version.dto';
import { CreateDocumentCommentDto } from '../dto/create-document-comment.dto';
import { GetDocumentsQueryDto } from '../dto/get-documents-query.dto';

@ApiTags('Documents')
@Controller('documents')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  @ApiOkResponse({ description: 'Document created successfully' })
  async createDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createDocumentDto: CreateDocumentDto,
  ) {
    try {
      const document = await this.documentService.createDocument(req.user.userId, createDocumentDto);
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
          approver: document.approver ? {
            id: document.approver.id,
            email: document.approver.email,
            firstName: document.approver.firstName,
            lastName: document.approver.lastName,
          } : null,
          department: document.department ? {
            id: document.department.id,
            name: document.department.name,
          } : null,
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
      const document = await this.documentService.getDocumentById(id, req.user.userId, req.user.role);
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
      const document = await this.documentService.updateDocument(id, req.user.userId, req.user.role, updateDocumentDto);
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
  @Post(':id/versions')
  @ApiOperation({ summary: 'Create document version' })
  @ApiOkResponse({ description: 'Document version created successfully' })
  async createDocumentVersion(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() createVersionDto: CreateDocumentVersionDto,
  ) {
    try {
      const version = await this.documentService.createDocumentVersion(id, req.user.userId, createVersionDto);
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
  @ApiOperation({ summary: 'Get document versions' })
  @ApiOkResponse({ description: 'Document versions retrieved successfully' })
  async getDocumentVersions(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    try {
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
      const comment = await this.documentService.createDocumentComment(id, req.user.userId, createCommentDto);
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
  @ApiOperation({ summary: 'Generate presigned URL for document asset upload' })
  @ApiOkResponse({ description: 'Presigned URL generated successfully' })
  async generateAssetPresignedUrl(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: { fileName: string; contentType: string; fileSize?: number },
  ) {
    try {
      const { presignedUrl, key, publicUrl } = await this.s3Service.generatePresignedUrl(
        body.fileName,
        body.contentType,
        'documents',
      );

      return {
        presignedUrl,
        key,
        publicUrl,
        message: 'Upload file to presigned URL, then call POST /documents/:id/assets to link to document',
      };
    } catch (error) {
      const errorMessage =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : 'An error occurred';
      throw new BadRequestException(errorMessage);
    }
  }
}
