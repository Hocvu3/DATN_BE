import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DocumentEntity, DocumentVersionEntity, DocumentAssetEntity, DocumentCommentEntity } from '../entities/document.entity';
import type { Document, DocumentVersion, Asset, Comment, Prisma } from '@prisma/client';

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===== DOCUMENT CRUD =====
  async create(data: Prisma.DocumentCreateInput): Promise<DocumentEntity> {
    return this.prisma.document.create({
      data,
      include: {
        creator: true,
        approver: true,
        department: true,
        versions: true,
        assets: true,
        tags: { include: { tag: true } },
        comments: {
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        signatureRequests: { include: { signatures: true } },
        auditLogs: true,
      },
    });
  }

  async findById(id: string): Promise<DocumentEntity | null> {
    return this.prisma.document.findUnique({
      where: { id },
      include: {
        creator: true,
        approver: true,
        department: true,
        versions: true,
        assets: true,
        tags: { include: { tag: true } },
        comments: {
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        signatureRequests: { include: { signatures: true } },
        auditLogs: true,
      },
    });
  }

  async findMany(params: {
    where?: Prisma.DocumentWhereInput;
    orderBy?: Prisma.DocumentOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<DocumentEntity[]> {
    const { where, orderBy, skip, take } = params;
    
    return this.prisma.document.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        creator: true,
        approver: true,
        department: true,
        versions: true,
        assets: true,
        tags: { include: { tag: true } },
        comments: {
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        signatureRequests: { include: { signatures: true } },
        auditLogs: true,
      },
    });
  }

  async count(where?: Prisma.DocumentWhereInput): Promise<number> {
    return this.prisma.document.count({ where });
  }

  async update(id: string, data: Prisma.DocumentUpdateInput): Promise<DocumentEntity> {
    return this.prisma.document.update({
      where: { id },
      data,
      include: {
        creator: true,
        approver: true,
        department: true,
        versions: true,
        assets: true,
        tags: { include: { tag: true } },
        comments: {
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        signatureRequests: { include: { signatures: true } },
        auditLogs: true,
      },
    });
  }

  async delete(id: string): Promise<Document> {
    return this.prisma.document.delete({
      where: { id },
    });
  }

  // ===== DOCUMENT VERSIONS =====
  async createVersion(data: Prisma.DocumentVersionCreateInput): Promise<DocumentVersionEntity> {
    return this.prisma.documentVersion.create({
      data,
      include: {
        document: true,
        creator: true,
      },
    });
  }

  async findVersionsByDocumentId(documentId: string): Promise<DocumentVersionEntity[]> {
    return this.prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        document: true,
        creator: true,
      },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async findLatestVersion(documentId: string): Promise<DocumentVersionEntity | null> {
    return this.prisma.documentVersion.findFirst({
      where: { documentId },
      include: {
        document: true,
        creator: true,
      },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async findVersionByNumber(documentId: string, versionNumber: number): Promise<DocumentVersionEntity | null> {
    return this.prisma.documentVersion.findFirst({
      where: { 
        documentId,
        versionNumber 
      },
      include: {
        document: true,
        creator: true,
      },
    });
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.prisma.documentVersion.delete({
      where: { id: versionId },
    });
  }


  // ===== DOCUMENT ASSETS =====
  async createAsset(data: Prisma.AssetCreateInput): Promise<DocumentAssetEntity> {
    return this.prisma.asset.create({
      data,
      include: {
        ownerDocument: true,
        uploadedBy: true,
        department: true,
      },
    });
  }

  async findAssetsByDocumentId(documentId: string): Promise<DocumentAssetEntity[]> {
    return this.prisma.asset.findMany({
      where: { ownerDocumentId: documentId },
      include: {
        ownerDocument: true,
        uploadedBy: true,
        department: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAssetById(assetId: string): Promise<DocumentAssetEntity | null> {
    return this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        ownerDocument: true,
        uploadedBy: true,
        department: true,
      },
    });
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.prisma.asset.delete({
      where: { id: assetId },
    });
  }

  // ===== DOCUMENT COMMENTS =====
  async createComment(data: Prisma.CommentCreateInput): Promise<DocumentCommentEntity> {
    return this.prisma.comment.create({
      data,
      include: {
        document: true,
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async findCommentsByDocumentId(documentId: string): Promise<DocumentCommentEntity[]> {
    return this.prisma.comment.findMany({
      where: { documentId },
      include: {
        document: true,
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===== DOCUMENT TAGS =====
  async addTag(documentId: string, tagId: string): Promise<void> {
    await this.prisma.documentTag.create({
      data: {
        documentId,
        tagId,
      },
    });
  }

  async removeTag(documentId: string, tagId: string): Promise<void> {
    await this.prisma.documentTag.delete({
      where: {
        documentId_tagId: {
          documentId,
          tagId,
        },
      },
    });
  }

  async findTagsByDocumentId(documentId: string) {
    return this.prisma.documentTag.findMany({
      where: { documentId },
      include: { tag: true },
    });
  }

  // ===== AUDIT LOGS =====
  async createAuditLog(data: Prisma.AuditLogCreateInput): Promise<void> {
    await this.prisma.auditLog.create({
      data,
    });
  }

  async findAuditLogsByDocumentId(documentId: string) {
    return this.prisma.auditLog.findMany({
      where: { documentId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        document: true,
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  // ===== VALIDATION METHODS =====
  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { 
        id: true, 
        email: true, 
        firstName: true, 
        lastName: true,
        departmentId: true 
      }
    });
  }

  async findDepartmentById(id: string) {
    return this.prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, description: true }
    });
  }

  // ===== SEARCH AND FILTER =====
  async searchDocuments(params: {
    search?: string;
    status?: string;
    securityLevel?: string;
    isConfidential?: boolean;
    departmentId?: string;
    creatorId?: string;
    tag?: string;
    createdFrom?: Date;
    createdTo?: Date;
    skip?: number;
    take?: number;
    orderBy?: Prisma.DocumentOrderByWithRelationInput;
  }) {
    const {
      search,
      status,
      securityLevel,
      isConfidential,
      departmentId,
      creatorId,
      tag,
      createdFrom,
      createdTo,
      skip,
      take,
      orderBy,
    } = params;

    const where: Prisma.DocumentWhereInput = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status as any;
    }

    if (securityLevel) {
      where.securityLevel = securityLevel as any;
    }

    if (isConfidential !== undefined) {
      where.isConfidential = isConfidential;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (tag) {
      where.tags = {
        some: {
          tag: {
            name: { contains: tag, mode: 'insensitive' },
          },
        },
      };
    }

    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) {
        where.createdAt.gte = createdFrom;
      }
      if (createdTo) {
        where.createdAt.lte = createdTo;
      }
    }

    return this.findMany({ where, orderBy, skip, take });
  }
}
