import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { TagRepository } from '../repositories/tag.repository';
import { CreateTagDto } from '../dto/create-tag.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';
import { GetTagsQueryDto } from '../dto/get-tags-query.dto';
import { AssignTagsDto } from '../dto/assign-tags.dto';
import type { TagEntity, DocumentTagEntity, TagWithDocumentCount } from '../entities/tag.entity';

@Injectable()
export class TagService {
  constructor(private readonly tagRepository: TagRepository) {}

  // ===== TAG CRUD OPERATIONS =====
  async createTag(createTagDto: CreateTagDto): Promise<TagEntity> {
    // Check if tag name already exists
    const existingTag = await this.tagRepository.findByName(createTagDto.name);
    if (existingTag) {
      throw new ConflictException(`Tag with name '${createTagDto.name}' already exists`);
    }

    return this.tagRepository.create({
      name: createTagDto.name,
      color: createTagDto.color,
      description: createTagDto.description,
      isActive: createTagDto.isActive ?? true,
    });
  }

  async getTags(query: GetTagsQueryDto): Promise<{ tags: TagWithDocumentCount[]; total: number; page: number; limit: number }> {
    const { tags, total } = await this.tagRepository.findMany({
      search: query.search,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      tags,
      total,
      page: query.page || 1,
      limit: query.limit || 10,
    };
  }

  async getTagById(id: string): Promise<TagEntity> {
    const tag = await this.tagRepository.findById(id);
    if (!tag) {
      throw new NotFoundException(`Tag with ID '${id}' not found`);
    }
    return tag;
  }

  async updateTag(id: string, updateTagDto: UpdateTagDto): Promise<TagEntity> {
    // Check if tag exists
    const existingTag = await this.tagRepository.findById(id);
    if (!existingTag) {
      throw new NotFoundException(`Tag with ID '${id}' not found`);
    }

    // Check if new name conflicts with existing tag
    if (updateTagDto.name && updateTagDto.name !== existingTag.name) {
      const nameConflict = await this.tagRepository.findByName(updateTagDto.name);
      if (nameConflict) {
        throw new ConflictException(`Tag with name '${updateTagDto.name}' already exists`);
      }
    }

    return this.tagRepository.update(id, {
      name: updateTagDto.name,
      color: updateTagDto.color,
      description: updateTagDto.description,
      isActive: updateTagDto.isActive,
    });
  }

  async deleteTag(id: string): Promise<void> {
    const tag = await this.tagRepository.findById(id);
    if (!tag) {
      throw new NotFoundException(`Tag with ID '${id}' not found`);
    }

    // Check if tag is being used by any documents
    if (tag.documents.length > 0) {
      throw new ConflictException(
        `Cannot delete tag '${tag.name}' because it is being used by ${tag.documents.length} document(s)`
      );
    }

    await this.tagRepository.delete(id);
  }

  // ===== DOCUMENT TAG OPERATIONS =====
  async getDocumentTags(documentId: string): Promise<TagEntity[]> {
    return this.tagRepository.findTagsByDocumentId(documentId);
  }

  async assignTagsToDocument(documentId: string, assignTagsDto: AssignTagsDto): Promise<DocumentTagEntity[]> {
    const { tagIds } = assignTagsDto;

    // Validate tag IDs
    const { valid, invalid } = await this.tagRepository.validateTagIds(tagIds);
    
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid tag IDs: ${invalid.join(', ')}`);
    }

    // Check if all tags are active
    const tags = await this.tagRepository.findTagsByIds(valid);
    const inactiveTags = tags.filter(tag => !tag.isActive);
    
    if (inactiveTags.length > 0) {
      throw new BadRequestException(
        `Cannot assign inactive tags: ${inactiveTags.map(tag => tag.name).join(', ')}`
      );
    }

    return this.tagRepository.assignTagsToDocument(documentId, valid);
  }

  async removeTagFromDocument(documentId: string, tagId: string): Promise<void> {
    // Check if tag exists
    const tag = await this.tagRepository.findById(tagId);
    if (!tag) {
      throw new NotFoundException(`Tag with ID '${tagId}' not found`);
    }

    await this.tagRepository.removeTagFromDocument(documentId, tagId);
  }

  async removeAllTagsFromDocument(documentId: string): Promise<void> {
    await this.tagRepository.removeAllTagsFromDocument(documentId);
  }

  // ===== UTILITY OPERATIONS =====
  async getTagUsageStats(): Promise<Array<{ tag: TagEntity; documentCount: number }>> {
    const stats = await this.tagRepository.getTagUsageStats();
    
    return stats.map(stat => ({
      tag: stat.tag as TagEntity,
      documentCount: stat.documentCount,
    }));
  }

  async searchTags(searchTerm: string, limit: number = 10): Promise<TagWithDocumentCount[]> {
    const { tags } = await this.tagRepository.findMany({
      search: searchTerm,
      isActive: true,
      page: 1,
      limit,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    return tags;
  }

  async getPopularTags(limit: number = 10): Promise<TagWithDocumentCount[]> {
    const { tags } = await this.tagRepository.findMany({
      isActive: true,
      page: 1,
      limit,
      sortBy: 'documentCount',
      sortOrder: 'desc',
    });

    return tags;
  }

  async bulkCreateTags(tagsData: CreateTagDto[]): Promise<TagEntity[]> {
    const createdTags: TagEntity[] = [];
    const errors: string[] = [];

    for (const tagData of tagsData) {
      try {
        const tag = await this.createTag(tagData);
        createdTags.push(tag);
      } catch (error) {
        if (error instanceof ConflictException) {
          errors.push(`Tag '${tagData.name}' already exists`);
        } else {
          errors.push(`Failed to create tag '${tagData.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    if (errors.length > 0 && createdTags.length === 0) {
      throw new BadRequestException(`Failed to create any tags: ${errors.join('; ')}`);
    }

    return createdTags;
  }

  async toggleTagStatus(id: string): Promise<TagEntity> {
    const tag = await this.getTagById(id);
    
    return this.tagRepository.update(id, {
      isActive: !tag.isActive,
    });
  }
}
