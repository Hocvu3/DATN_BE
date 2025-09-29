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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TagService } from '../services/tag.service';
import { CreateTagDto } from '../dto/create-tag.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';
import { GetTagsQueryDto } from '../dto/get-tags-query.dto';
import { AssignTagsDto } from '../dto/assign-tags.dto';
import type { TagEntity, DocumentTagEntity, TagWithDocumentCount } from '../entities/tag.entity';

@ApiTags('Tags')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Create a new tag',
    description:
      'Create a new tag with name, color, description, and active status. Only ADMIN and MANAGER roles can create tags.',
  })
  @ApiCreatedResponse({
    description: 'Tag created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'tag-important-123' },
        name: { type: 'string', example: 'Important' },
        color: { type: 'string', example: '#FF5733' },
        description: { type: 'string', example: 'This tag is used for important documents' },
        isActive: { type: 'boolean', example: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        documents: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Tag name already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createTag(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createTagDto: CreateTagDto,
  ): Promise<TagEntity> {
    return this.tagService.createTag(createTagDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all tags',
    description: 'Retrieve a paginated list of tags with optional filtering and sorting',
  })
  @ApiOkResponse({
    description: 'Tags retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        tags: {
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
              documentCount: { type: 'number' },
            },
          },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search term for tag name or description',
  })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'createdAt', 'documentCount'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getTags(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetTagsQueryDto,
  ): Promise<{ tags: TagWithDocumentCount[]; total: number; page: number; limit: number }> {
    return this.tagService.getTags(query);
  }

  @Get('popular')
  @ApiOperation({
    summary: 'Get popular tags',
    description: 'Get the most used tags ordered by document count',
  })
  @ApiOkResponse({
    description: 'Popular tags retrieved successfully',
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
          documentCount: { type: 'number' },
        },
      },
    },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of popular tags to return',
    example: 10,
  })
  async getPopularTags(
    @Req() req: { user: { userId: string; role: string } },
    @Query('limit') limit?: number,
  ): Promise<TagWithDocumentCount[]> {
    return this.tagService.getPopularTags(limit);
  }

  @Get('stats')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Get tag usage statistics',
    description:
      'Get statistics about tag usage across all documents. Only ADMIN and MANAGER roles can access this endpoint.',
  })
  @ApiOkResponse({
    description: 'Tag usage statistics retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              color: { type: 'string' },
              description: { type: 'string' },
              isActive: { type: 'boolean' },
            },
          },
          documentCount: { type: 'number' },
        },
      },
    },
  })
  async getTagUsageStats(
    @Req() req: { user: { userId: string; role: string } },
  ): Promise<Array<{ tag: TagEntity; documentCount: number }>> {
    return this.tagService.getTagUsageStats();
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search tags',
    description: 'Search for tags by name or description',
  })
  @ApiOkResponse({
    description: 'Search results retrieved successfully',
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
        },
      },
    },
  })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results',
    example: 10,
  })
  async searchTags(
    @Req() req: { user: { userId: string; role: string } },
    @Query('q') searchTerm: string,
    @Query('limit') limit?: number,
  ): Promise<TagWithDocumentCount[]> {
    return this.tagService.searchTags(searchTerm, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get tag by ID',
    description: 'Retrieve a specific tag by its ID',
  })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiOkResponse({
    description: 'Tag retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        description: { type: 'string' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        documents: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async getTagById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<TagEntity> {
    return this.tagService.getTagById(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Update tag',
    description: 'Update an existing tag. Only ADMIN and MANAGER roles can update tags.',
  })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiOkResponse({
    description: 'Tag updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        description: { type: 'string' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        documents: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiConflictResponse({ description: 'Tag name already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async updateTag(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateTagDto: UpdateTagDto,
  ): Promise<TagEntity> {
    return this.tagService.updateTag(id, updateTagDto);
  }

  @Put(':id/toggle')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Toggle tag status',
    description:
      'Toggle the active status of a tag. Only ADMIN and MANAGER roles can toggle tag status.',
  })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiOkResponse({
    description: 'Tag status toggled successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        description: { type: 'string' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        documents: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async toggleTagStatus(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<TagEntity> {
    return this.tagService.toggleTagStatus(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete tag',
    description:
      'Delete a tag. Only ADMIN role can delete tags. Tag must not be used by any documents.',
  })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 204, description: 'Tag deleted successfully' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiConflictResponse({ description: 'Tag is being used by documents' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async deleteTag(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<void> {
    return this.tagService.deleteTag(id);
  }

  @Post('bulk')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Bulk create tags',
    description: 'Create multiple tags at once. Only ADMIN and MANAGER roles can bulk create tags.',
  })
  @ApiCreatedResponse({
    description: 'Tags created successfully',
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
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input data or failed to create any tags' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async bulkCreateTags(
    @Req() req: { user: { userId: string; role: string } },
    @Body() tagsData: CreateTagDto[],
  ): Promise<TagEntity[]> {
    return this.tagService.bulkCreateTags(tagsData);
  }
}
