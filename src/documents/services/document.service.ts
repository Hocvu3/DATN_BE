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
import type { Document } from '@prisma/client';
import { DocumentStatus, SecurityLevel } from '@prisma/client';
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
    // Validate required fields
    if (!createDocumentDto.title || !createDocumentDto.documentNumber) {
      throw new BadRequestException('Title and document number are required');
    }

    // Check if document number already exists
    const existingDocument = await this.documentRepository.findById(createDocumentDto.documentNumber);
    if (existingDocument) {
      throw new ConflictException('Document number already exists');
    }

    // Validate approver exists if provided
    if (createDocumentDto.approverId) {
      const approver = await this.documentRepository.findUserById(createDocumentDto.approverId);
      if (!approver) {
        throw new BadRequestException('Approver not found');
      }
    }

    // Validate department exists if provided
    if (createDocumentDto.departmentId) {
      const department = await this.documentRepository.findDepartmentById(createDocumentDto.departmentId);
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
      user: { connect: { id: creatorId } },
      document: { connect: { id: document.id } },
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

    // Build where clause for count (including search logic)
    const countWhere: any = { ...where };
    
    // Apply search filters to count where clause
    if (query.search) {
      // If there's already an OR clause from role-based filtering, we need to combine them
      if (countWhere.OR) {
        countWhere.AND = [
          { OR: countWhere.OR }, // existing role-based OR
          { OR: [ // search OR
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
            { documentNumber: { contains: query.search, mode: 'insensitive' } },
          ]}
        ];
        delete countWhere.OR; // remove the original OR since it's now in AND
      } else {
        countWhere.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { documentNumber: { contains: query.search, mode: 'insensitive' } },
        ];
      }
    }
    
    // Apply other filters to count where clause
    if (query.status) {
      countWhere.status = query.status;
    }
    if (query.securityLevel) {
      countWhere.securityLevel = query.securityLevel;
    }
    if (query.isConfidential !== undefined) {
      countWhere.isConfidential = query.isConfidential;
    }
    if (query.departmentId) {
      this.logger.debug(`Filtering by departmentId: ${query.departmentId}`);
      countWhere.departmentId = query.departmentId;
    }
    if (query.creatorId) {
      countWhere.creatorId = query.creatorId;
    }
    if (query.tag) {
      countWhere.tags = {
        some: {
          tag: {
            name: { contains: query.tag, mode: 'insensitive' },
          },
        },
      };
    }
    if (query.createdFrom || query.createdTo) {
      countWhere.createdAt = {};
      if (query.createdFrom) {
        countWhere.createdAt.gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        countWhere.createdAt.lte = new Date(query.createdTo);
      }
    }

    const [documents, total] = await Promise.all([
      this.documentRepository.searchDocuments({
        ...searchParams,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.documentRepository.count(countWhere),
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
      const approver = await this.documentRepository.findUserById(updateDocumentDto.approverId);
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
      user: { connect: { id: userId } },
      document: { connect: { id: id } },
      details: { changes: JSON.parse(JSON.stringify(updateDocumentDto)) },
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
      user: { connect: { id: userId } },
      document: { connect: { id: id } },
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

    // Get existing versions to determine next version number
    const existingVersions = await this.documentRepository.findVersionsByDocumentId(documentId);
    
    // Auto-generate version number if not provided
    let versionNumber = createVersionDto.versionNumber;
    if (!versionNumber) {
      const maxVersion = existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0);
      versionNumber = maxVersion + 1;
    }

    // Check if version number already exists
    const versionExists = existingVersions.some(v => v.versionNumber === versionNumber);
    if (versionExists) {
      throw new ConflictException('Version number already exists for this document');
    }

    const version = await this.documentRepository.createVersion({
      document: { connect: { id: documentId } },
      creator: { connect: { id: userId } },
      versionNumber: versionNumber,
      filePath: createVersionDto.s3Key || '', // Use s3Key as filePath for backward compatibility
      s3Key: createVersionDto.s3Key,
      s3Url: createVersionDto.s3Url,
      fileSize: createVersionDto.fileSize || 0,
      checksum: createVersionDto.checksum || '',
      mimeType: createVersionDto.mimeType || '',
      isEncrypted: createVersionDto.isEncrypted,
      encryptionKey: createVersionDto.encryptionKey,
    });

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'CREATE_VERSION',
      resource: 'DocumentVersion',
      resourceId: version.id,
      user: { connect: { id: userId } },
      document: { connect: { id: documentId } },
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

  async getDocumentVersion(documentId: string, versionNumber: number): Promise<DocumentVersionEntity> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const version = await this.documentRepository.findVersionByNumber(documentId, versionNumber);
    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for this document`);
    }

    return version;
  }

  async getLatestDocumentVersion(documentId: string): Promise<DocumentVersionEntity> {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const version = await this.documentRepository.findLatestVersion(documentId);
    if (!version) {
      throw new NotFoundException('No versions found for this document');
    }

    return version;
  }

  async deleteDocumentVersion(
    documentId: string,
    versionNumber: number,
    userId: string,
    userRole: string,
  ): Promise<void> {
    // Check if document exists
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check access permissions
    await this.checkDocumentAccess(document, userId, userRole);

    // Find the version to delete
    const version = await this.documentRepository.findVersionByNumber(documentId, versionNumber);
    if (!version) {
      throw new NotFoundException(`Version ${versionNumber} not found for this document`);
    }

    // Check if this is the only version (prevent deleting the last version)
    const allVersions = await this.documentRepository.findVersionsByDocumentId(documentId);
    if (allVersions.length === 1) {
      throw new BadRequestException('Cannot delete the last version of a document');
    }

    // Delete file from S3 if s3Key exists
    if (version.s3Key) {
      try {
        await this.s3Service.deleteFile(version.s3Key);
        this.logger.log(`Deleted file from S3: ${version.s3Key}`);
      } catch (error) {
        this.logger.warn(`Failed to delete file from S3: ${version.s3Key}`, error);
        // Continue with database deletion even if S3 deletion fails
      }
    }

    // Delete version from database
    await this.documentRepository.deleteVersion(version.id);

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'DELETE_VERSION',
      resource: 'DocumentVersion',
      resourceId: version.id,
      user: { connect: { id: userId } },
      document: { connect: { id: documentId } },
      details: { 
        versionNumber: version.versionNumber,
        s3Key: version.s3Key,
        filename: version.filePath 
      },
    });

    this.logger.log(`Document version deleted: ${version.id} (v${versionNumber}) for document ${documentId}`);
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
      content: createCommentDto.content || '',
      isInternal: createCommentDto.isInternal || false,
    });

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'CREATE_COMMENT',
      resource: 'Comment',
      resourceId: comment.id,
      user: { connect: { id: userId } },
      document: { connect: { id: documentId } },
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

  // ===== DOCUMENT ASSETS =====
  async linkAssetToDocument(
    documentId: string,
    userId: string,
    assetData: {
      s3Key: string;
      filename: string;
      contentType: string;
      sizeBytes?: number;
    }
  ) {
    // Check if document exists
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check access permissions
    await this.checkDocumentAccess(document, userId, 'ADMIN'); // Allow all authenticated users for now

    // Get user info for department
    const user = await this.documentRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Create asset record
    const asset = await this.documentRepository.createAsset({
      filename: assetData.filename,
      s3Url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${assetData.s3Key}`,
      contentType: assetData.contentType,
      sizeBytes: assetData.sizeBytes ? BigInt(assetData.sizeBytes) : null,
      ownerDocument: { connect: { id: documentId } },
      uploadedBy: { connect: { id: userId } },
      department: user.departmentId ? { connect: { id: user.departmentId } } : undefined,
    });

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'UPLOAD_ASSET',
      resource: 'Asset',
      resourceId: asset.id,
      user: { connect: { id: userId } },
      document: { connect: { id: documentId } },
      details: { 
        filename: asset.filename, 
        s3Key: assetData.s3Key,
        contentType: asset.contentType 
      },
    });

    this.logger.log(`Asset linked to document: ${asset.id} for document ${documentId}`);
    return asset;
  }

  async getDocumentAssets(documentId: string) {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.documentRepository.findAssetsByDocumentId(documentId);
  }

  async deleteDocumentAsset(
    documentId: string,
    assetId: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    // Check if document exists
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check access permissions
    await this.checkDocumentAccess(document, userId, userRole);

    // Find the asset to delete
    const asset = await this.documentRepository.findAssetById(assetId);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Check if asset belongs to this document
    if (asset.ownerDocumentId !== documentId) {
      throw new BadRequestException('Asset does not belong to this document');
    }

    // Extract S3 key from S3 URL
    const s3Key = this.extractS3KeyFromUrl(asset.s3Url);
    
    // Delete file from S3 if s3Key exists
    if (s3Key) {
      try {
        await this.s3Service.deleteFile(s3Key);
        this.logger.log(`Deleted asset file from S3: ${s3Key}`);
      } catch (error) {
        this.logger.warn(`Failed to delete asset file from S3: ${s3Key}`, error);
        // Continue with database deletion even if S3 deletion fails
      }
    }

    // Delete asset from database
    await this.documentRepository.deleteAsset(assetId);

    // Create audit log
    await this.documentRepository.createAuditLog({
      action: 'DELETE_ASSET',
      resource: 'Asset',
      resourceId: assetId,
      user: { connect: { id: userId } },
      document: { connect: { id: documentId } },
      details: { 
        filename: asset.filename,
        s3Url: asset.s3Url,
        s3Key: s3Key
      },
    });

    this.logger.log(`Document asset deleted: ${assetId} for document ${documentId}`);
  }

  private extractS3KeyFromUrl(s3Url: string): string | null {
    try {
      const url = new URL(s3Url);
      // Extract key from URL like: https://bucket.s3.amazonaws.com/path/to/file.pdf
      return url.pathname.substring(1); // Remove leading slash
    } catch (error) {
      this.logger.warn(`Failed to extract S3 key from URL: ${s3Url}`, error);
      return null;
    }
  }
}
