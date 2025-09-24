import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { SignatureRepository } from '../repositories/signature.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSignatureRequestDto } from '../dto/create-signature-request.dto';
import { UpdateSignatureRequestDto } from '../dto/update-signature-request.dto';
import { GetSignatureRequestsQueryDto } from '../dto/get-signature-requests-query.dto';
import { SignDocumentDto } from '../dto/sign-document.dto';
import { UpdateSignatureStatusDto } from '../dto/update-signature-status.dto';
import type { 
  SignatureRequestEntity, 
  DigitalSignatureEntity, 
  SignatureRequestWithDetails,
  SignatureStats 
} from '../entities/signature.entity';
import { SignatureType, SignatureStatus, Prisma } from '@prisma/client';

@Injectable()
export class SignatureService {
  constructor(
    private readonly signatureRepository: SignatureRepository,
    private readonly prisma: PrismaService,
  ) {}

  // ===== SIGNATURE REQUEST OPERATIONS =====
  async createSignatureRequest(
    createSignatureRequestDto: CreateSignatureRequestDto,
    requesterId: string,
  ): Promise<SignatureRequestEntity> {
    const { documentId, signatureType, expiresAt, reason } = createSignatureRequestDto;

    // Validate expiration date
    const expirationDate = new Date(expiresAt);
    if (expirationDate <= new Date()) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    // Check if document exists and user has permission to request signature
    // This would typically involve checking document permissions
    // For now, we'll assume the user has permission

    return this.prisma.runWithUserContext({ userId: requesterId, role: null, departmentId: null }, async (tx) => {
      return this.signatureRepository.createSignatureRequest(
        {
          document: { connect: { id: documentId } },
          requester: { connect: { id: requesterId } },
          signatureType: signatureType as SignatureType,
          expiresAt: expirationDate,
          reason,
        },
        tx,
      );
    });
  }

  async getSignatureRequests(
    query: GetSignatureRequestsQueryDto,
    userId: string,
    userRole: string,
  ): Promise<{ requests: SignatureRequestWithDetails[]; total: number; page: number; limit: number }> {
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

  async getSignatureRequestById(id: string, userId: string, userRole: string): Promise<SignatureRequestEntity> {
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
    const request = await this.signatureRepository.findSignatureRequestById(requestId);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${requestId}' not found`);
    }

    // Check if request is still pending
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Signature request is no longer pending');
    }

    // Check if request is expired
    if (request.expiresAt < new Date()) {
      throw new BadRequestException('Signature request has expired');
    }

    // Check if user can sign this request
    const canSign = await this.signatureRepository.checkIfUserCanSignRequest(requestId, signerId);
    if (!canSign) {
      throw new ForbiddenException('You do not have permission to sign this document');
    }

    // Check if user has already signed this request
    const existingSignature = request.signatures.find(sig => sig.signerId === signerId);
    if (existingSignature) {
      throw new ConflictException('You have already signed this document');
    }

    // Create digital signature within context so triggers capture current user
    return this.prisma.runWithUserContext({ userId: signerId, role: userRole, departmentId: null }, async (tx) => {
      const digitalSignature = await this.signatureRepository.createDigitalSignature(
        {
          request: { connect: { id: requestId } },
          signer: { connect: { id: signerId } },
          signatureData: signDocumentDto.signatureData,
          certificateInfo: signDocumentDto.certificateInfo as unknown as Prisma.InputJsonValue,
          ipAddress: signDocumentDto.ipAddress,
          userAgent: signDocumentDto.userAgent,
        },
        tx,
      );

      await this.signatureRepository.updateSignatureRequest(
        requestId,
        {
          status: SignatureStatus.SIGNED,
          signedAt: new Date(),
        },
        tx,
      );

      return digitalSignature;
    });
  }

  async getDigitalSignatureById(id: string, userId: string, userRole: string): Promise<DigitalSignatureEntity> {
    const signature = await this.signatureRepository.findDigitalSignatureById(id);
    if (!signature) {
      throw new NotFoundException(`Digital signature with ID '${id}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && signature.signerId !== userId && signature.request.requesterId !== userId) {
      throw new ForbiddenException('You do not have permission to view this digital signature');
    }

    return signature;
  }

  async getDigitalSignaturesByRequestId(requestId: string, userId: string, userRole: string): Promise<DigitalSignatureEntity[]> {
    const request = await this.signatureRepository.findSignatureRequestById(requestId);
    if (!request) {
      throw new NotFoundException(`Signature request with ID '${requestId}' not found`);
    }

    // Check permissions
    if (userRole !== 'ADMIN' && request.requesterId !== userId) {
      throw new ForbiddenException('You do not have permission to view signatures for this request');
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
      throw new ForbiddenException('You do not have permission to update this signature request status');
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

    if (((updateSignatureStatusDto.status as any) === 'REJECTED' || nextStatus === SignatureStatus.CANCELLED) && updateSignatureStatusDto.reason) {
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

  async getSignatureRequestsByRequester(requesterId: string, userId: string, userRole: string): Promise<SignatureRequestEntity[]> {
    // Check permissions
    if (userRole !== 'ADMIN' && requesterId !== userId) {
      throw new ForbiddenException('You can only view your own signature requests');
    }

    return this.signatureRepository.findSignatureRequestsByRequester(requesterId);
  }

  async markExpiredRequests(): Promise<number> {
    return this.signatureRepository.markExpiredRequests();
  }

  async getSignatureRequestsByDocumentId(documentId: string, userId: string, userRole: string): Promise<SignatureRequestEntity[]> {
    // Add permission check here - user should have access to the document
    return this.signatureRepository.findSignatureRequestsByDocumentId(documentId);
  }

  // ===== WORKFLOW OPERATIONS =====
  async approveSignatureRequest(id: string, userId: string, userRole: string): Promise<SignatureRequestEntity> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can approve signature requests');
    }

    return this.updateSignatureStatus(id, { status: SignatureStatus.SIGNED as any }, userId, userRole);
  }

  async rejectSignatureRequest(id: string, reason: string, userId: string, userRole: string): Promise<SignatureRequestEntity> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can reject signature requests');
    }

    return this.updateSignatureStatus(id, { status: SignatureStatus.CANCELLED as any, reason }, userId, userRole);
  }
}
