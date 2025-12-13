import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { SignatureRepository } from '../repositories/signature.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { CreateSignatureRequestDto } from '../dto/create-signature-request.dto';
import { UpdateSignatureRequestDto } from '../dto/update-signature-request.dto';
import { GetSignatureRequestsQueryDto } from '../dto/get-signature-requests-query.dto';
import { SignDocumentDto } from '../dto/sign-document.dto';
import { UpdateSignatureStatusDto } from '../dto/update-signature-status.dto';
import type {
  SignatureRequestEntity,
  DigitalSignatureEntity,
  SignatureRequestWithDetails,
  SignatureStats,
} from '../entities/signature.entity';
import { SignatureType, SignatureStatus, Prisma } from '@prisma/client';

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  constructor(
    private readonly signatureRepository: SignatureRepository,
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  // ===== SIGNATURE REQUEST OPERATIONS =====
  async createSignatureRequest(
    createSignatureRequestDto: CreateSignatureRequestDto,
    requesterId: string,
  ): Promise<SignatureRequestEntity> {
    const { documentVersionId, signatureType, expiresAt, reason } = createSignatureRequestDto;

    // Validate expiration date
    const expirationDate = new Date(expiresAt);
    if (expirationDate <= new Date()) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    // Check if document version exists
    const documentVersion = await this.prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
    });
    if (!documentVersion) {
      throw new NotFoundException('Document version not found');
    }

    return this.prisma.runWithUserContext(
      { userId: requesterId, role: null, departmentId: null },
      async tx => {
        return this.signatureRepository.createSignatureRequest(
          {
            documentVersion: { connect: { id: documentVersionId } },
            requester: { connect: { id: requesterId } },
            signatureType: signatureType,
            expiresAt: expirationDate,
            reason,
          },
          tx,
        );
      },
    );
  }

  async getSignatureRequests(
    query: GetSignatureRequestsQueryDto,
    userId: string,
    userRole: string,
  ): Promise<{
    requests: SignatureRequestWithDetails[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Apply role-based filtering
    const filters = { ...query };

    // Non-admin users can only see their own requests or requests they can sign
    if (userRole !== 'ADMIN') {
      // For now, we'll show all requests, but in a real implementation,
      // you might want to filter based on user permissions
    }

    const { requests, total } = await this.signatureRepository.findSignatureRequests(filters);

    return {
      requests,
      total,
      page: query.page || 1,
      limit: query.limit || 10,
    };
  }

  async getSignatureRequestById(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity> {
    const request = await this.signatureRepository.findSignatureRequestById(id);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${id}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      // Add additional permission checks here
      throw new ForbiddenException('You do not have permission to view this signature request');
    }

    return request;
  }

  async updateSignatureRequest(
    id: string,
    updateSignatureRequestDto: UpdateSignatureRequestDto,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity> {
    const request = await this.signatureRepository.findSignatureRequestById(id);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${id}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      throw new ForbiddenException('You do not have permission to update this signature request');
    }

    // Check if request can be updated
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only pending signature requests can be updated');
    }

    const updateData: any = {};

    if (updateSignatureRequestDto.expiresAt) {
      const expirationDate = new Date(updateSignatureRequestDto.expiresAt);
      if (expirationDate <= new Date()) {
        throw new BadRequestException('Expiration date must be in the future');
      }
      updateData.expiresAt = expirationDate;
    }

    if (updateSignatureRequestDto.reason !== undefined) {
      updateData.reason = updateSignatureRequestDto.reason;
    }

    if (updateSignatureRequestDto.signatureType) {
      updateData.signatureType = updateSignatureRequestDto.signatureType;
    }

    return this.signatureRepository.updateSignatureRequest(id, updateData);
  }

  async deleteSignatureRequest(id: string, userId: string, userRole: string): Promise<void> {
    const request = await this.signatureRepository.findSignatureRequestById(id);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${id}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this signature request');
    }

    // Check if request can be deleted
    if (request.status === 'SIGNED') {
      throw new BadRequestException('Signed requests cannot be deleted');
    }

    await this.signatureRepository.deleteSignatureRequest(id);
  }

  // ===== DIGITAL SIGNATURE OPERATIONS =====
  async signDocument(
    requestId: string,
    signDocumentDto: SignDocumentDto,
    signerId: string,
    userRole: string,
  ): Promise<DigitalSignatureEntity> {
    this.logger.log(`[signDocument] Starting sign process for request ${requestId} by user ${signerId}`);

    const request = await this.signatureRepository.findSignatureRequestById(requestId);
    if (!request) {
      this.logger.error(`[signDocument] Signature request not found: ${requestId}`);
      throw new NotFoundException(`Signature request with ID '${requestId}' not found`);
    }

    // Check if request is still pending
    if (request.status !== 'PENDING') {
      this.logger.error(`[signDocument] Request is not pending: ${request.status}`);
      throw new BadRequestException('Signature request is no longer pending');
    }

    // Check if request is expired
    if (request.expiresAt < new Date()) {
      this.logger.error(`[signDocument] Request has expired: ${request.expiresAt}`);
      throw new BadRequestException('Signature request has expired');
    }

    // Get document version
    const documentVersion = await this.prisma.documentVersion.findUnique({
      where: { id: request.documentVersionId },
      include: { document: true },
    });
    if (!documentVersion) {
      this.logger.error(`[signDocument] Document version not found: ${request.documentVersionId}`);
      throw new NotFoundException('Document version not found');
    }
    this.logger.log(`[signDocument] Document version validated: v${documentVersion.versionNumber} (ID: ${documentVersion.id})`);

    // Generate document hash and signature (similar to apply stamp logic)
    let documentHash: string | null = null;
    let signatureHash: string | null = null;
    
    if (documentVersion.s3Key) {
      try {
        this.logger.log(`[signDocument] Using S3 key: ${documentVersion.s3Key}`);
        const { hash, signature } = await this.cryptoService.hashAndSignFile(documentVersion.s3Key);
        documentHash = hash;
        signatureHash = signature;
        this.logger.log(`[signDocument] Generated hashes - Document: ${documentHash?.substring(0, 20)}..., Signature: ${signatureHash?.substring(0, 20)}...`);
      } catch (error) {
        this.logger.error('[signDocument] Failed to generate document hash:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new BadRequestException('Failed to generate document hash: ' + errorMessage);
      }
    }

    // Create digital signature within context so triggers capture current user
    return this.prisma.runWithUserContext(
      { userId: signerId, role: userRole, departmentId: null },
      async tx => {
        // Check if this version already has a signature from this user
        const existingSignature = await tx.digitalSignature.findFirst({
          where: {
            documentVersionId: documentVersion.id,
            signerId: signerId,
          },
        });

        let digitalSignature;
        
        if (existingSignature) {
          this.logger.log(`[signDocument] Found existing digital signature ${existingSignature.id}, updating...`);
          // Update existing signature (re-sign scenario)
          digitalSignature = await tx.digitalSignature.update({
            where: { id: existingSignature.id },
            data: {
              documentHash: documentHash,
              signatureHash: signatureHash,
              signatureStatus: 'VALID',
              verifiedAt: new Date(),
              signatureData: JSON.stringify({
                ...signDocumentDto,
                signedAt: new Date().toISOString(),
                documentHash: documentHash,
                versionNumber: documentVersion.versionNumber,
                signatureAlgorithm: 'RSA-SHA256',
              }),
            },
          });
          this.logger.log(`[signDocument] Updated digital signature ${digitalSignature.id}`);
        } else {
          this.logger.log(`[signDocument] No existing digital signature found, creating new one...`);
          // Create new digital signature (hash-based, no signature stamp ID required)
          digitalSignature = await tx.digitalSignature.create({
            data: {
              documentVersion: { connect: { id: documentVersion.id } },
              signer: { connect: { id: signerId } },
              documentHash: documentHash,
              signatureHash: signatureHash,
              signatureStatus: 'VALID',
              verifiedAt: new Date(),
              signatureData: JSON.stringify({
                ...signDocumentDto,
                signedAt: new Date().toISOString(),
                documentHash: documentHash,
                versionNumber: documentVersion.versionNumber,
                signatureAlgorithm: 'RSA-SHA256',
              }),
            },
          });
          this.logger.log(`[signDocument] Created new digital signature ${digitalSignature.id}`);
        }

        // Update signature request status
        await this.signatureRepository.updateSignatureRequest(
          requestId,
          {
            status: SignatureStatus.SIGNED,
            signedAt: new Date(),
          },
          tx,
        );
        this.logger.log(`[signDocument] Updated signature request status to SIGNED`);

        // Update document version status to APPROVED (similar to apply stamp logic)
        await tx.documentVersion.update({
          where: { id: documentVersion.id },
          data: { status: 'APPROVED' },
        });
        this.logger.log(`[signDocument] Updated document version status to APPROVED`);

        return digitalSignature;
      },
    );
  }

  async getDigitalSignatureById(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<DigitalSignatureEntity> {
    const signature = await this.signatureRepository.findDigitalSignatureById(id);
    if (!signature) {
      throw new NotFoundException(`Digital signature with ID '${id}' not found`);
    }

    // Check permissions
    if (
      userRole !== 'ADMIN' &&
      signature.signerId !== userId
    ) {
      throw new ForbiddenException('You do not have permission to view this digital signature');
    }

    return signature;
  }

  async getDigitalSignaturesByRequestId(
    requestId: string,
    userId: string,
    userRole: string,
  ): Promise<DigitalSignatureEntity[]> {
    const request = await this.signatureRepository.findSignatureRequestById(requestId);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${requestId}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view signatures for this request',
      );
    }

    return this.signatureRepository.findDigitalSignaturesByRequestId(requestId);
  }

  // ===== STATUS MANAGEMENT =====
  async updateSignatureStatus(
    id: string,
    updateSignatureStatusDto: UpdateSignatureStatusDto,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity> {
    const request = await this.signatureRepository.findSignatureRequestById(id);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${id}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this signature request status',
      );
    }

    // Check if status can be updated
    if (request.status === 'SIGNED') {
      throw new BadRequestException('Signed requests cannot have their status changed');
    }

    let nextStatus: SignatureStatus | undefined = undefined;
    if ((updateSignatureStatusDto.status as any) === 'REJECTED') {
      nextStatus = SignatureStatus.CANCELLED;
    } else {
      nextStatus = updateSignatureStatusDto.status as unknown as SignatureStatus;
    }

    const updateData: any = {
      status: nextStatus,
    };

    if (
      ((updateSignatureStatusDto.status as any) === 'REJECTED' ||
        nextStatus === SignatureStatus.CANCELLED) &&
      updateSignatureStatusDto.reason
    ) {
      updateData.reason = updateSignatureStatusDto.reason;
    }

    return this.signatureRepository.updateSignatureRequest(id, updateData);
  }

  // ===== UTILITY OPERATIONS =====
  async getSignatureStats(userRole: string): Promise<SignatureStats> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can view signature statistics');
    }

    return this.signatureRepository.getSignatureStats();
  }

  async getPendingSignatureRequests(userId: string): Promise<SignatureRequestEntity[]> {
    return this.signatureRepository.findPendingSignatureRequestsForUser(userId);
  }

  async getSignatureRequestsByRequester(
    requesterId: string,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity[]> {
    // Check permissions
    if (userRole !== 'ADMIN' && requesterId !== userId) {
      throw new ForbiddenException('You can only view your own signature requests');
    }

    return this.signatureRepository.findSignatureRequestsByRequester(requesterId);
  }

  async markExpiredRequests(): Promise<number> {
    return this.signatureRepository.markExpiredRequests();
  }

  async getSignatureRequestsByDocumentId(
    documentId: string,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity[]> {
    // Add permission check here - user should have access to the document
    return this.signatureRepository.findSignatureRequestsByDocumentId(documentId);
  }

  // ===== WORKFLOW OPERATIONS =====
  async approveSignatureRequest(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can approve signature requests');
    }

    return this.updateSignatureStatus(
      id,
      { status: SignatureStatus.SIGNED as any },
      userId,
      userRole,
    );
  }

  async rejectSignatureRequest(
    id: string,
    reason: string,
    userId: string,
    userRole: string,
  ): Promise<SignatureRequestEntity> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can reject signature requests');
    }

    return this.updateSignatureStatus(
      id,
      { status: SignatureStatus.CANCELLED as any, reason },
      userId,
      userRole,
    );
  }

  // ===== AUTO-CREATE SIGNATURE REQUEST =====
  /**
   * Automatically create a signature request when a document version is created
   * This is called internally by the document service
   */
  async autoCreateSignatureRequest(
    documentVersionId: string,
    creatorId: string,
  ): Promise<SignatureRequestEntity> {
    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return this.prisma.runWithUserContext(
      { userId: creatorId, role: null, departmentId: null },
      async tx => {
        return tx.signatureRequest.create({
          data: {
            documentVersion: { connect: { id: documentVersionId } },
            requester: { connect: { id: creatorId } },
            signatureType: SignatureType.DIGITAL,
            expiresAt: expiresAt,
            status: SignatureStatus.PENDING,
            reason: 'Auto-generated signature request',
          },
          include: {
            requester: true,
          },
        });
      },
    );
  }

  // ===== REVOKE SIGNATURE =====
  /**
   * Revoke a signed document signature
   * Changes status back to PENDING and deletes the digital signature
   */
  async revokeSignature(
    requestId: string,
    userId: string,
    userRole: string,
  ): Promise<{ id: string; status: string; message: string }> {
    this.logger.log(`[revokeSignature] Starting revoke process for request ${requestId} by user ${userId}`);

    // Find the signature request
    const request = await this.signatureRepository.findSignatureRequestById(requestId);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${requestId}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      throw new ForbiddenException('You do not have permission to revoke this signature');
    }

    // Check if request is signed
    if (request.status !== 'SIGNED') {
      throw new BadRequestException('Only signed requests can be revoked');
    }

    this.logger.log(`[revokeSignature] Request is SIGNED, proceeding with revoke...`);

    return this.prisma.runWithUserContext(
      { userId: userId, role: userRole, departmentId: null },
      async tx => {
        // Find and delete the digital signature for this document version
        const digitalSignature = await tx.digitalSignature.findFirst({
          where: {
            documentVersionId: request.documentVersionId,
          },
        });

        if (digitalSignature) {
          this.logger.log(`[revokeSignature] Found digital signature ${digitalSignature.id}, deleting...`);
          await tx.digitalSignature.delete({
            where: { id: digitalSignature.id },
          });
          this.logger.log(`[revokeSignature] Digital signature deleted`);
        } else {
          this.logger.log(`[revokeSignature] No digital signature found for this document version`);
        }

        // Update signature request status back to PENDING
        await this.signatureRepository.updateSignatureRequest(
          requestId,
          {
            status: SignatureStatus.PENDING,
            signedAt: null,
          },
          tx,
        );
        this.logger.log(`[revokeSignature] Updated signature request status to PENDING`);

        // Update document version status back to PENDING
        await tx.documentVersion.update({
          where: { id: request.documentVersionId },
          data: { status: 'PENDING_APPROVAL' },
        });
        this.logger.log(`[revokeSignature] Updated document version status to PENDING_APPROVAL`);

        return {
          id: requestId,
          status: 'PENDING',
          message: 'Signature revoked successfully',
        };
      },
    );
  }
}
