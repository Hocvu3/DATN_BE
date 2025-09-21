import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { TagEntity, DocumentTagEntity, TagWithDocumentCount } from '../entities/tag.entity';
import type { Tag, DocumentTag, Prisma } from '@prisma/client';

@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===== TAG CRUD OPERATIONS =====
  async create(data: Prisma.TagCreateInput): Promise<TagEntity> {
    return this.prisma.tag.create({
      data,
      include: {
        documents: {
          include: {
            document: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<TagEntity | null> {
    return this.prisma.tag.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            document: true,
          },
        },
      },
    });
  }

  async findByName(name: string): Promise<TagEntity | null> {
    return this.prisma.tag.findUnique({
      where: { name },
      include: {
        documents: {
          include: {
            document: true,
          },
        },
      },
    });
  }

  async findMany(params: {
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'createdAt' | 'documentCount';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ tags: TagWithDocumentCount[]; total: number }> {
    const {
      search,
      isActive,
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'asc',
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.TagWhereInput = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Build orderBy clause
    let orderBy: Prisma.TagOrderByWithRelationInput = {};
    
    if (sortBy === 'documentCount') {
      // For document count, we need to use a different approach
      orderBy = { documents: { _count: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const [tags, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        include: {
          documents: {
            include: {
              document: true,
            },
          },
          _count: {
            select: {
              documents: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.tag.count({ where }),
    ]);

    // Transform to include documentCount
    const tagsWithCount: TagWithDocumentCount[] = tags.map(tag => ({
      ...tag,
      documentCount: tag._count.documents,
    }));

    return { tags: tagsWithCount, total };
  }

  async update(id: string, data: Prisma.TagUpdateInput): Promise<TagEntity> {
    return this.prisma.tag.update({
      where: { id },
      data,
      include: {
        documents: {
          include: {
            document: true,
          },
        },
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.tag.delete({
      where: { id },
    });
  }

  // ===== DOCUMENT TAG RELATIONS =====
  async findDocumentTags(documentId: string): Promise<DocumentTagEntity[]> {
    return this.prisma.documentTag.findMany({
      where: { documentId },
      include: {
        document: true,
        tag: true,
      },
      orderBy: { tag: { name: 'asc' } },
    });
  }

  async findTagsByDocumentId(documentId: string): Promise<TagEntity[]> {
    const documentTags = await this.prisma.documentTag.findMany({
      where: { documentId },
      include: {
        tag: {
          include: {
            documents: {
              include: {
                document: true,
              },
            },
          },
        },
      },
    });

    return documentTags.map(dt => dt.tag);
  }

  async assignTagsToDocument(documentId: string, tagIds: string[]): Promise<DocumentTagEntity[]> {
    // First, remove existing tags
    await this.prisma.documentTag.deleteMany({
      where: { documentId },
    });

    // Then, create new tag assignments
    const createData = tagIds.map(tagId => ({
      documentId,
      tagId,
    }));

    await this.prisma.documentTag.createMany({
      data: createData,
    });

    // Return the created document tags
    return this.prisma.documentTag.findMany({
      where: { documentId },
      include: {
        document: true,
        tag: true,
      },
    });
  }

  async removeTagFromDocument(documentId: string, tagId: string): Promise<void> {
    await this.prisma.documentTag.deleteMany({
      where: {
        documentId,
        tagId,
      },
    });
  }

  async removeAllTagsFromDocument(documentId: string): Promise<void> {
    await this.prisma.documentTag.deleteMany({
      where: { documentId },
    });
  }

  // ===== UTILITY METHODS =====
  async getTagUsageStats(): Promise<Array<{ tag: Tag; documentCount: number }>> {
    const tags = await this.prisma.tag.findMany({
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
      orderBy: {
        documents: {
          _count: 'desc',
        },
      },
    });

    return tags.map(tag => ({
      tag,
      documentCount: tag._count.documents,
    }));
  }

  async findTagsByIds(tagIds: string[]): Promise<TagEntity[]> {
    return this.prisma.tag.findMany({
      where: {
        id: {
          in: tagIds,
        },
      },
      include: {
        documents: {
          include: {
            document: true,
          },
        },
      },
    });
  }

  async validateTagIds(tagIds: string[]): Promise<{ valid: string[]; invalid: string[] }> {
    const existingTags = await this.prisma.tag.findMany({
      where: {
        id: {
          in: tagIds,
        },
      },
      select: { id: true },
    });

    const existingIds = existingTags.map(tag => tag.id);
    const valid = tagIds.filter(id => existingIds.includes(id));
    const invalid = tagIds.filter(id => !existingIds.includes(id));

    return { valid, invalid };
  }
}
