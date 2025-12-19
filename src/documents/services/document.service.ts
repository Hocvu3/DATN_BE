import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { S3Service } from '../../s3/s3.service';
import { SignatureService } from '../../signatures/services/signature.service';
import type {
  DocumentEntity,
  DocumentVersionEntity,
  DocumentCommentEntity,
} from '../entities/document.entity';
import { DocumentStatus, SecurityLevel } from '@prisma/client';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { CreateDocumentVersionDto } from '../dto/create-document-version.dto';
import { CreateDocumentCommentDto } from '../dto/create-document-comment.dto';
import { GetDocumentsQueryDto } from '../dto/get-documents-query.dto';
import { IAssetData } from '../interfaces/document-file.interface';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly s3Service: S3Service,
    @Inject(forwardRef(() => SignatureService))
    private readonly signatureService: SignatureService,
  ) { }

  // ===== FILE VALIDATION METHODS =====
  private validateImageFile(contentType: string): boolean {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowedImageTypes.includes(contentType.toLowerCase());
  }

  private validateDocumentFile(contentType: string): boolean {
    const allowedDocumentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
    ];
    return allowedDocumentTypes.includes(contentType.toLowerCase());
  }

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
    const existingDocument = await this.documentRepository.findById(
      createDocumentDto.documentNumber,
    );
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
      const department = await this.documentRepository.findDepartmentById(
        createDocumentDto.departmentId,
      );
      if (!department) {
        throw new BadRequestException('Department not found');
      }
    }

    // Create document
    const document = await this.documentRepository.create({
      title: createDocumentDto.title,
      description: createDocumentDto.description,
      documentNumber: createDocumentDto.documentNumber,      securityLevel: createDocumentDto.securityLevel || SecurityLevel.INTERNAL,
      isConfidential: createDocumentDto.isConfidential || false,
      creator: { connect: { id: creatorId } },
      approver: createDocumentDto.approverId
        ? { connect: { id: createDocumentDto.approverId } }
        : undefined,
      department: createDocumentDto.departmentId
        ? { connect: { id: createDocumentDto.departmentId } }
        : undefined,
    });

    // Add tags if provided
    if (createDocumentDto.tags && createDocumentDto.tags.length > 0) {
      await this.addTagsToDocument(document.id, createDocumentDto.tags);
    }

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
        OR: [{ creatorId: userId }, { approverId: userId }],
      };
    } else if (userRole === 'MANAGER') {
      // Managers can see documents in their department
      const user = await this.documentRepository.findById(userId);
      if (user?.departmentId) {
        where = {
          OR: [{ creatorId: userId }, { departmentId: user.departmentId }],
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
          {
            OR: [
              // search OR
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { documentNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          },
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

    const documentsWithCovers = await Promise.all(
      documents.map(async (doc) => {
        const cover = await this.getDocumentCover(doc.id);
        return {
          ...doc,
          cover,
        };
      })
    );

    const totalPages = Math.ceil(total / limit);

    return {
      documents: documentsWithCovers,
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

    // Try to get document cover if available
    try {
      const cover = await this.getDocumentCover(id);
      return {
        ...document,
        cover
      };
    } catch (error) {
      // No cover found, continue without it
      return document;
    }
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

    // Update tags first if provided
    if (updateDocumentDto.tags !== undefined) {
      await this.updateDocumentTags(id, updateDocumentDto.tags);
    }

    // Update document
    const updatedDocument = await this.documentRepository.update(id, {
      title: updateDocumentDto.title,
      description: updateDocumentDto.description,      securityLevel: updateDocumentDto.securityLevel,
      isConfidential: updateDocumentDto.isConfidential,
      approver: updateDocumentDto.approverId
        ? { connect: { id: updateDocumentDto.approverId } }
        : undefined,
      department: updateDocumentDto.departmentId
        ? { connect: { id: updateDocumentDto.departmentId } }
        : undefined,
    });

    // Create audit log

    this.logger.log(`Document updated: ${id} by ${userId}`);

    // Return fresh document data with updated tags
    const freshDocument = await this.documentRepository.findById(id);
    if (!freshDocument) {
      throw new NotFoundException('Document not found after update');
    }
    return freshDocument;
  }

  async deleteDocument(id: string, userId: string, userRole: string): Promise<void> {
    const document = await this.documentRepository.findById(id);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check permissions
    this.checkDocumentDeletePermission(document, userId, userRole);

    // Delete document (cascade will handle related records)
    await this.documentRepository.delete(id);

    // Create audit log

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

    // Auto-create signature request for this version
    try {
      await this.signatureService.autoCreateSignatureRequest(version.id, userId);
      this.logger.log(`Signature request auto-created for version ${version.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to auto-create signature request: ${errorMessage}`);
      // Don't fail the version creation if signature request fails
    }

    // Create audit log

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

  async getDocumentVersion(
    documentId: string,
    versionNumber: number,
  ): Promise<DocumentVersionEntity> {
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

    this.logger.log(
      `Document version deleted: ${version.id} (v${versionNumber}) for document ${documentId}`,
    );
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
  async addTagsToDocument(documentId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      try {
        await this.documentRepository.addTag(documentId, tagId);
      } catch (error) {
        // Log error but continue with other tags
        this.logger.warn(`Failed to add tag ${tagId} to document ${documentId}:`, error);
      }
    }
  }

  async updateDocumentTags(documentId: string, tagIds: string[]): Promise<void> {
    // Remove all existing tags
    const existingTags = await this.documentRepository.findTagsByDocumentId(documentId);
    for (const tag of existingTags) {
      await this.documentRepository.removeTag(documentId, tag.tagId);
    }

    // Add new tags (now expecting tag IDs instead of tag names)
    if (tagIds && tagIds.length > 0) {
      await this.addTagsToDocument(documentId, tagIds);
    }
  }

  // ===== PERMISSION CHECKS =====
  private async checkDocumentAccess(
    document: DocumentEntity,
    userId: string,
    userRole: string,
  ): Promise<void> {
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

  private async checkDocumentUpdatePermission(
    document: DocumentEntity,
    userId: string,
    userRole: string,
  ): Promise<void> {
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

  private checkDocumentDeletePermission(
    document: DocumentEntity,
    userId: string,
    userRole: string,
  ) {
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
    },
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
      sizeBytes: assetData.sizeBytes ? assetData.sizeBytes.toString() : null,
      ownerDocument: { connect: { id: documentId } },
      uploadedBy: { connect: { id: userId } },    });

    // Create audit log

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

  // ===== ENHANCED ASSET MANAGEMENT WITH COVER SUPPORT =====
  async linkDocumentAssetWithCover(documentId: string, userId: string, assetData: IAssetData) {
    // Check if document exists
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Check access permissions
    await this.checkDocumentAccess(document, userId, 'ADMIN');

    // Get user info for department
    const user = await this.documentRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Validate file types
    if (assetData.isCover) {
      const isValidImage = this.validateImageFile(assetData.contentType);
      if (!isValidImage) {
        throw new BadRequestException('Invalid cover image type');
      }
    } else {
      const isValidDocument = this.validateDocumentFile(assetData.contentType);
      if (!isValidDocument) {
        throw new BadRequestException('Invalid document file type');
      }
    }

    // Create asset record
    const asset = await this.documentRepository.createAsset({
      filename: assetData.filename,
      s3Url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${assetData.s3Key}`,
      contentType: assetData.contentType,
      sizeBytes: assetData.sizeBytes ? assetData.sizeBytes.toString() : null,
      isCover: assetData.isCover || false,
      ownerDocument: { connect: { id: documentId } },
      uploadedBy: { connect: { id: userId } },    });

    // Create audit log

    this.logger.log(
      `${assetData.isCover ? 'Cover image' : 'Asset'} linked to document: ${asset.id} for document ${documentId}`,
    );
    return asset;
  }

  async getDocumentCover(documentId: string) {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const assets = await this.documentRepository.findAssetsByDocumentId(documentId);
    const coverAsset = assets.find(asset => asset.isCover === true);

    return coverAsset || null;
  }

  async updateDocumentCover(
    documentId: string,
    userId: string,
    userRole: string,
    newCoverData: IAssetData,
  ) {
    // Check if document exists and user has permissions
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.checkDocumentUpdatePermission(document, userId, userRole);

    // Validate cover image
    const isValidImage = this.validateImageFile(newCoverData.contentType);
    if (!isValidImage) {
      throw new BadRequestException('Invalid cover image type');
    }

    // Find existing cover
    const assets = await this.documentRepository.findAssetsByDocumentId(documentId);
    const existingCover = assets.find(asset => asset.isCover === true);

    // Delete old cover if exists
    if (existingCover) {
      await this.deleteDocumentAsset(documentId, existingCover.id, userId, userRole);
    }

    // Create new cover
    const coverData: IAssetData = {
      ...newCoverData,
      isCover: true,
    };

    return this.linkDocumentAssetWithCover(documentId, userId, coverData);
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(userId: string, userRole: string) {
    const prisma = this.documentRepository['prisma'];

    // Get all documents with their latest version
    const allDocuments = await prisma.document.findMany({
      select: {
        id: true,
        createdAt: true,
        versions: {
          select: { status: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    const pendingDocuments = await prisma.signatureRequest.count({
      where: {
        status: 'PENDING',
      },
    });

    const totalDocuments = allDocuments.length;
    const draftDocuments = allDocuments.filter(d => d.versions[0]?.status === DocumentStatus.DRAFT).length;
    const approvedDocuments = allDocuments.filter(d => d.versions[0]?.status === DocumentStatus.APPROVED).length;
    const rejectedDocuments = allDocuments.filter(d => d.versions[0]?.status === DocumentStatus.REJECTED).length;
    const archivedDocuments = allDocuments.filter(d => d.versions[0]?.status === DocumentStatus.ARCHIVED).length;

    // Get user and department statistics
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalDepartments,
      documentsThisMonth,
      documentsLastMonth,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.department.count(),
      prisma.document.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      prisma.document.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    // Get recent documents (last 10) with latest version status
    const recentDocuments = await prisma.document.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        versions: {
          select: {
            status: true,
            versionNumber: true,
          },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    // Get documents by department
    const departmentStats = await prisma.department.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    // Get documents by status for chart (only show non-zero)
    const documentsByStatus = [
      { status: 'DRAFT', name: 'Draft', count: draftDocuments, color: '#8c8c8c' },
      { status: 'PENDING_APPROVAL', name: 'Pending', count: pendingDocuments, color: '#faad14' },
      { status: 'APPROVED', name: 'Approved', count: approvedDocuments, color: '#52c41a' },
      { status: 'REJECTED', name: 'Rejected', count: rejectedDocuments, color: '#ff4d4f' },
      { status: 'ARCHIVED', name: 'Archived', count: archivedDocuments, color: '#722ed1' },
    ].filter(item => item.count > 0);

    // Users by status
    const usersByStatus = [
      { status: 'ACTIVE', name: 'Active', count: activeUsers, color: '#52c41a' },
      { status: 'INACTIVE', name: 'Inactive', count: inactiveUsers, color: '#ff4d4f' },
    ].filter(item => item.count > 0);

    // Get top 5 departments by document count
    const topDepartments = departmentStats
      .sort((a, b) => b._count.documents - a._count.documents)
      .slice(0, 5)
      .filter(d => d._count.documents > 0)
      .map(d => ({
        name: d.name,
        count: d._count.documents,
      }));

    // Get documents created per day for last 7 days
    const last7Days: Array<{ date: string; dayName: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await prisma.document.count({
        where: {
          createdAt: {
            gte: date,
            lt: nextDate,
          },
        },
      });

      last7Days.push({
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        count,
      });
    }

    // Calculate growth percentage
    const growthPercentage = documentsLastMonth > 0
      ? Math.round(((documentsThisMonth - documentsLastMonth) / documentsLastMonth) * 100)
      : documentsThisMonth > 0 ? 100 : 0;

    return {
      overview: {
        totalDocuments,
        totalUsers,
        totalDepartments,
        pendingApprovals: pendingDocuments,
        documentsThisMonth,
        growthPercentage,
      },
      documentsByStatus,
      usersByStatus,
      topDepartments,
      documentsPerDay: last7Days,
      departmentStats: departmentStats.map(d => ({
        id: d.id,
        name: d.name,
        documentCount: d._count.documents,
      })),
      recentDocuments: recentDocuments.map(doc => ({
        id: doc.id,
        title: doc.title,
        documentNumber: doc.documentNumber,
        status: doc.versions[0]?.status || 'DRAFT',
        createdAt: doc.createdAt,
        creator: doc.creator,
        department: doc.department,
      })),
    };
  }
}
