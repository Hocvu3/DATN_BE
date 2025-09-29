import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TagService } from '../services/tag.service';
import { AssignTagsDto } from '../dto/assign-tags.dto';
import type { TagEntity, DocumentTagEntity } from '../entities/tag.entity';

@ApiTags('Document Tags')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents/:documentId/tags')
export class DocumentTagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  @ApiOperation({
    summary: 'Get document tags',
    description: 'Retrieve all tags assigned to a specific document',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiOkResponse({
    description: 'Document tags retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          color: { type: 'string' },
          description: { type: 'string' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async getDocumentTags(
    @Req() req: { user: { userId: string; role: string } },
    @Param('documentId') documentId: string,
  ): Promise<TagEntity[]> {
    return this.tagService.getDocumentTags(documentId);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Assign tags to document',
    description: 'Assign one or more tags to a document. All roles can assign tags to documents.',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiCreatedResponse({
    description: 'Tags assigned successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          documentId: { type: 'string' },
          tagId: { type: 'string' },
          document: { type: 'object' },
          tag: { type: 'object' },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid tag IDs or inactive tags' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async assignTagsToDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('documentId') documentId: string,
    @Body() assignTagsDto: AssignTagsDto,
  ): Promise<DocumentTagEntity[]> {
    return this.tagService.assignTagsToDocument(documentId, assignTagsDto);
  }

  @Delete(':tagId')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove tag from document',
    description: 'Remove a specific tag from a document. All roles can remove tags from documents.',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiParam({ name: 'tagId', description: 'Tag ID to remove' })
  @ApiResponse({ status: 204, description: 'Tag removed successfully' })
  @ApiNotFoundResponse({ description: 'Document or tag not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async removeTagFromDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('documentId') documentId: string,
    @Param('tagId') tagId: string,
  ): Promise<void> {
    return this.tagService.removeTagFromDocument(documentId, tagId);
  }

  @Delete()
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove all tags from document',
    description: 'Remove all tags from a document. All roles can remove all tags from documents.',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 204, description: 'All tags removed successfully' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async removeAllTagsFromDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('documentId') documentId: string,
  ): Promise<void> {
    return this.tagService.removeAllTagsFromDocument(documentId);
  }
}
