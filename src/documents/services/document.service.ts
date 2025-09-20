import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { S3Service } from '../../s3/s3.service';
import type { DocumentEntity, DocumentVersionEntity, DocumentCommentEntity } from '../entities/document.entity';
import type { Document, DocumentStatus, SecurityLevel } from '@prisma/client';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { CreateDocumentVersionDto } from '../dto/create-document-version.dto';
import { CreateDocumentCommentDto } from '../dto/create-document-comment.dto';
import { GetDocumentsQueryDto } from '../dto/get-documents-query.dto';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly s3Service: S3Service,
  ) {}

  // ===== DOCUMENT CRUD =====
  async createDocument(
    creatorId: string,
    createDocumentDto: CreateDocumentDto,
  ): Promise<DocumentEntity> {
    // Check if document number already exists
    const existingDocument = await this.documentRepository.findById(createDocumentDto.documentNumber);
    if (existingDocument) {
      throw new ConflictException('Document number already exists');
    }

    // Validate approver exists if provided
    if (createDocumentDto.approverId) {
      const approver = await this.documentRepository.findById(createDocumentDto.approverId);
      if (!approver) {
        throw new BadRequestException('Approver not found');
      }
    }

    // Validate department exists if provided
    if (createDocumentDto.departmentId) {
      const department = await this.documentRepository.findById(createDocumentDto.departmentId);
      if (!department) {
        throw new BadRequestException('Department not found');
      }
    }

    // Create document
    const document = await this.documentRepository.create({
      title: createDocumentDto.title,
      description: createDocumentDto.description,
      documentNumber: createDocumentDto.documentNumber,
      status: createDocumentDto.status || DocumentStatus.DRAFT,
      securityLevel: createDocumentDto.securityLevel || SecurityLevel.INTERNAL,
      isConfidential: createDocumentDto.isConfidential || false,
      creator: { connect: { id: creatorId } },
      approver: createDocumentDto.approverId ? { connect: { id: createDocumentDto.approverId } } : undefined,
      department: createDocumentDto.departmentId ? { connect: { id: createDocumentDto.departmentId } } : undefined,
    });

    // Add tags if provided
    if (createDocumentDto.tags && createDocumentDto.tags.length > 0) {
      await this.addTagsToDocument(document.id, createDocumentDto.tags);
    }

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'CREATE',
      resource: 'Document',
      resourceId: document.id,
      userId: creatorId,
      documentId: document.id,
      details: { title: document.title, documentNumber: document.documentNumber },
    });

    this.logger.log(`Document created: ${document.documentNumber} by ${creatorId}`);
    return document;
  }

  async getDocuments(
    userId: string,
    userRole: string,
    query: GetDocumentsQueryDto,
  ): Promise<{
    documents: DocumentEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build where clause based on user role
    let where: any = {};

    // Apply role-based filtering
    if (userRole === 'EMPLOYEE') {
      // Employees can only see documents they created or are assigned to
      where = {
        OR: [
          { creatorId: userId },
          { approverId: userId },
        ],
      };
    } else if (userRole === 'MANAGER') {
      // Managers can see documents in their department
      const user = await this.documentRepository.findById(userId);
      if (user?.departmentId) {
        where = {
          OR: [
            { creatorId: userId },
            { departmentId: user.departmentId },
          ],
        };
      } else {
        where = { creatorId: userId };
      }
    }
    // ADMIN can see all documents (no additional filtering)

    // Apply search filters
    const searchParams = {
      search: query.search,
      status: query.status,
      securityLevel: query.securityLevel,
      isConfidential: query.isConfidential,
      departmentId: query.departmentId,
      creatorId: query.creatorId,
      tag: query.tag,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
    };

    // Merge role-based where with search filters
    const finalWhere = { ...where, ...searchParams };

    const [documents, total] = await Promise.all([
      this.documentRepository.searchDocuments({
        ...searchParams,
        where: finalWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.documentRepository.count(finalWhere),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      documents,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getDocumentById(id: string, userId: string, userRole: string): Promise<DocumentEntity> {
    const document = await this.documentRepository.findById(id);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check access permissions
    await this.checkDocumentAccess(document, userId, userRole);

    return document;
  }

  async updateDocument(
    id: string,
    userId: string,
    userRole: string,
    updateDocumentDto: UpdateDocumentDto,
  ): Promise<DocumentEntity> {
    const document = await this.documentRepository.findById(id);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check permissions
    await this.checkDocumentUpdatePermission(document, userId, userRole);

    // Validate approver if provided
    if (updateDocumentDto.approverId) {
      const approver = await this.documentRepository.findById(updateDocumentDto.approverId);
      if (!approver) {
        throw new BadRequestException('Approver not found');
      }
    }

    // Update document
    const updatedDocument = await this.documentRepository.update(id, {
      title: updateDocumentDto.title,
      description: updateDocumentDto.description,
      status: updateDocumentDto.status,
      securityLevel: updateDocumentDto.securityLevel,
      isConfidential: updateDocumentDto.isConfidential,
      approver: updateDocumentDto.approverId ? { connect: { id: updateDocumentDto.approverId } } : undefined,
      department: updateDocumentDto.departmentId ? { connect: { id: updateDocumentDto.departmentId } } : undefined,
    });

    // Update tags if provided
    if (updateDocumentDto.tags) {
      await this.updateDocumentTags(id, updateDocumentDto.tags);
    }

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'UPDATE',
      resource: 'Document',
      resourceId: id,
      userId,
      documentId: id,
      details: { changes: updateDocumentDto },
    });

    this.logger.log(`Document updated: ${id} by ${userId}`);
    return updatedDocument;
  }

  async deleteDocument(id: string, userId: string, userRole: string): Promise<void> {
    const document = await this.documentRepository.findById(id);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check permissions
    await this.checkDocumentDeletePermission(document, userId, userRole);

    // Delete document (cascade will handle related records)
    await this.documentRepository.delete(id);

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'DELETE',
      resource: 'Document',
      resourceId: id,
      userId,
      documentId: id,
      details: { title: document.title, documentNumber: document.documentNumber },
    });

    this.logger.log(`Document deleted: ${id} by ${userId}`);
  }

  // ===== DOCUMENT VERSIONS =====
  async createDocumentVersion(
    documentId: string,
    userId: string,
    createVersionDto: CreateDocumentVersionDto,
  ): Promise<DocumentVersionEntity> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check if version number already exists
    const existingVersion = await this.documentRepository.findVersionsByDocumentId(documentId);
    const versionExists = existingVersion.some(v => v.versionNumber === createVersionDto.versionNumber);
    if (versionExists) {
      throw new ConflictException('Version number already exists for this document');
    }

    const version = await this.documentRepository.createVersion({
      document: { connect: { id: documentId } },
      creator: { connect: { id: userId } },
      versionNumber: createVersionDto.versionNumber,
      filePath: createVersionDto.filePath,
      fileSize: createVersionDto.fileSize,
      checksum: createVersionDto.checksum,
      mimeType: createVersionDto.mimeType,
      isEncrypted: createVersionDto.isEncrypted,
      encryptionKey: createVersionDto.encryptionKey,
    });

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'CREATE_VERSION',
      resource: 'DocumentVersion',
      resourceId: version.id,
      userId,
      documentId,
      details: { versionNumber: version.versionNumber, filePath: version.filePath },
    });

    this.logger.log(`Document version created: ${version.id} for document ${documentId}`);
    return version;
  }

  async getDocumentVersions(documentId: string): Promise<DocumentVersionEntity[]> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.documentRepository.findVersionsByDocumentId(documentId);
  }

  // ===== DOCUMENT COMMENTS =====
  async createDocumentComment(
    documentId: string,
    userId: string,
    createCommentDto: CreateDocumentCommentDto,
  ): Promise<DocumentCommentEntity> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const comment = await this.documentRepository.createComment({
      document: { connect: { id: documentId } },
      author: { connect: { id: userId } },
      content: createCommentDto.content,
      isInternal: createCommentDto.isInternal || false,
    });

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'CREATE_COMMENT',
      resource: 'Comment',
      resourceId: comment.id,
      userId,
      documentId,
      details: { isInternal: comment.isInternal },
    });

    this.logger.log(`Comment created: ${comment.id} for document ${documentId}`);
    return comment;
  }

  async getDocumentComments(documentId: string): Promise<DocumentCommentEntity[]> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.documentRepository.findCommentsByDocumentId(documentId);
  }

  // ===== DOCUMENT TAGS =====
  async addTagsToDocument(documentId: string, tagNames: string[]): Promise<void> {
    for (const tagName of tagNames) {
      // Find or create tag
      let tag = await this.documentRepository.findById(tagName); // This should be a tag lookup
      if (!tag) {
        // Create tag if it doesn't exist
        // This would need a tag service/repository
        continue;
      }
      
      await this.documentRepository.addTag(documentId, tag.id);
    }
  }

  async updateDocumentTags(documentId: string, tagNames: string[]): Promise<void> {
    // Remove all existing tags
    const existingTags = await this.documentRepository.findTagsByDocumentId(documentId);
    for (const tag of existingTags) {
      await this.documentRepository.removeTag(documentId, tag.tagId);
    }

    // Add new tags
    await this.addTagsToDocument(documentId, tagNames);
  }

  // ===== PERMISSION CHECKS =====
  private async checkDocumentAccess(document: DocumentEntity, userId: string, userRole: string): Promise<void> {
    if (userRole === 'ADMIN') {
      return; // Admin can access all documents
    }

    if (userRole === 'MANAGER') {
      const user = await this.documentRepository.findById(userId);
      if (user?.departmentId && document.departmentId === user.departmentId) {
        return; // Manager can access documents in their department
      }
    }

    if (document.creatorId === userId || document.approverId === userId) {
      return; // User can access documents they created or are assigned to approve
    }

    throw new ForbiddenException('You do not have permission to access this document');
  }

  private async checkDocumentUpdatePermission(document: DocumentEntity, userId: string, userRole: string): Promise<void> {
    if (userRole === 'ADMIN') {
      return; // Admin can update all documents
    }

    if (userRole === 'MANAGER') {
      const user = await this.documentRepository.findById(userId);
      if (user?.departmentId && document.departmentId === user.departmentId) {
        return; // Manager can update documents in their department
      }
    }

    if (document.creatorId === userId) {
      return; // Creator can update their own documents
    }

    throw new ForbiddenException('You do not have permission to update this document');
  }

  private async checkDocumentDeletePermission(document: DocumentEntity, userId: string, userRole: string): Promise<void> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can delete documents');
    }

    if (document.creatorId === userId) {
      throw new ForbiddenException('You cannot delete your own documents');
    }
  }
}
