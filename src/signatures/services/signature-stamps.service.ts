import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { SignatureStampsRepository } from '../repositories/signature-stamps.repository';
import { S3Service } from '../../s3/s3.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { CreateSignatureDto } from '../dto/create-signature.dto';
import { UpdateSignatureDto } from '../dto/update-signature.dto';
import { GetSignaturesQueryDto } from '../dto/get-signatures-query.dto';
import { ApplySignatureDto } from '../dto/apply-signature.dto';
import type { Signature, DigitalSignature, Prisma } from '@prisma/client';
import type { SignatureStampWithCreator } from '../entities/signature-stamp.entity';
import { SignatureType, SignatureStatus } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

@Injectable()
export class SignatureStampsService {
  private readonly logger = new Logger(SignatureStampsService.name);

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly signatureStampsRepository: SignatureStampsRepository,
    private readonly s3Service: S3Service,
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  async create(createSignatureDto: CreateSignatureDto, userId: string): Promise<Signature> {
    // Check if signature name already exists
    const existingSignature = await this.signatureStampsRepository.findByName(
      createSignatureDto.name,
    );
    if (existingSignature) {
      throw new ConflictException(
        `Signature stamp with name '${createSignatureDto.name}' already exists`,
      );
    }

    return this.signatureStampsRepository.create({
      name: createSignatureDto.name,
      description: createSignatureDto.description,
      imageUrl: createSignatureDto.imageUrl,
      s3Key: createSignatureDto.s3Key,
      createdById: userId,
    });
  }

  async findAll(
    query: GetSignaturesQueryDto,
  ): Promise<{ signatures: SignatureStampWithCreator[]; total: number; page: number; limit: number }> {
    const { signatures, total } = await this.signatureStampsRepository.findMany({
      search: query.search,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });

    return {
      signatures,
      total,
      page: query.page || 1,
      limit: query.limit || 10,
    };
  }

  async findById(id: string): Promise<SignatureStampWithCreator> {
    const signature = await this.signatureStampsRepository.findById(id);
    if (!signature) {
      throw new NotFoundException(`Signature stamp with ID '${id}' not found`);
    }
    return signature;
  }

  async update(id: string, updateSignatureDto: UpdateSignatureDto): Promise<Signature> {
    // Check if signature exists
    const existingSignature = await this.signatureStampsRepository.findById(id);
    if (!existingSignature) {
      throw new NotFoundException(`Signature stamp with ID '${id}' not found`);
    }

    // Check if new name conflicts with existing signature
    if (updateSignatureDto.name && updateSignatureDto.name !== existingSignature.name) {
      const nameConflict = await this.signatureStampsRepository.findByName(updateSignatureDto.name);
      if (nameConflict) {
        throw new ConflictException(
          `Signature stamp with name '${updateSignatureDto.name}' already exists`,
        );
      }
    }

    return this.signatureStampsRepository.update(id, {
      name: updateSignatureDto.name,
      description: updateSignatureDto.description,
      isActive: updateSignatureDto.isActive,
    });
  }

  async delete(id: string): Promise<void> {
    const signature = await this.signatureStampsRepository.findById(id);
    if (!signature) {
      throw new NotFoundException(`Signature stamp with ID '${id}' not found`);
    }

    // Delete image from S3
    try {
      await this.s3Service.deleteFile(signature.s3Key);
    } catch (error) {
      // Log error but don't fail the deletion
      console.error(`Failed to delete signature image from S3: ${error}`);
    }

    await this.signatureStampsRepository.delete(id);
  }

  async getActiveSignatures(): Promise<SignatureStampWithCreator[]> {
    return this.signatureStampsRepository.findActiveSignatures();
  }

  async generatePresignedUrl(fileName: string, contentType: string): Promise<{
    presignedUrl: string;
    key: string;
    publicUrl: string;
  }> {
    return this.s3Service.generateSignaturePresignedUrl(fileName, contentType);
  }

  // ===== DIGITAL SIGNATURE OPERATIONS =====
  async applySignatureStamp(
    applySignatureDto: ApplySignatureDto,
    userId: string,
    userRole: string,
  ): Promise<DigitalSignature> {
    const { documentId, signatureStampId, reason } = applySignatureDto;

    this.logger.log(`[applySignatureStamp] Starting approval process for document ${documentId} by user ${userId} with stamp ${signatureStampId}`);

    // Verify signature stamp exists and is active
    const signatureStamp = await this.signatureStampsRepository.findById(signatureStampId);
    if (!signatureStamp) {
      this.logger.error(`[applySignatureStamp] Signature stamp not found: ${signatureStampId}`);
      throw new NotFoundException(`Signature stamp with ID '${signatureStampId}' not found`);
    }
    if (!signatureStamp.isActive) {
      this.logger.error(`[applySignatureStamp] Signature stamp is inactive: ${signatureStampId}`);
      throw new BadRequestException('Cannot apply an inactive signature stamp');
    }
    this.logger.log(`[applySignatureStamp] Signature stamp validated: ${signatureStamp.name}`);

    // Verify document exists
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        assets: {
          where: { isCover: false },
          take: 1,
        },
      },
    });
    if (!document) {
      this.logger.error(`[applySignatureStamp] Document not found: ${documentId}`);
      throw new NotFoundException(`Document with ID '${documentId}' not found`);
    }
    this.logger.log(`[applySignatureStamp] Document validated: ${document.title}`);

    // Generate document hash and signature
    let documentHash: string | null = null;
    let signatureHash: string | null = null;
    
    if (document.assets && document.assets.length > 0) {
      try {
        const mainAsset = document.assets[0];
        // Extract S3 key from URL or use s3Key field if available
        const s3Key = this.extractS3Key(mainAsset.s3Url);
        this.logger.log(`[applySignatureStamp] Extracted S3 key: ${s3Key}`);
        
        // Generate SHA-256 hash of the document
        const { hash, signature } = await this.cryptoService.hashAndSignFile(s3Key);
        documentHash = hash;
        signatureHash = signature;
        this.logger.log(`[applySignatureStamp] Generated hashes - Document: ${documentHash?.substring(0, 20)}..., Signature: ${signatureHash?.substring(0, 20)}...`);
      } catch (error) {
        this.logger.error('[applySignatureStamp] Failed to generate document hash:', error);
        // Continue without hash if file not accessible
      }
    } else {
      this.logger.warn(`[applySignatureStamp] No assets found for document ${documentId}`);
    }

    // Check if document already has a signature request
    let signatureRequest = await this.prisma.signatureRequest.findFirst({
      where: {
        documentId,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    });

    if (signatureRequest) {
      this.logger.log(`[applySignatureStamp] Found existing signature request ${signatureRequest.id}, updating...`);
      // Update existing signature request
      signatureRequest = await this.prisma.signatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          requesterId: userId,
          signatureType: SignatureType.ELECTRONIC,
          reason: reason || 'Document approval signature',
          status: SignatureStatus.SIGNED,
          signedAt: new Date(),
        },
      });
    } else {
      this.logger.log(`[applySignatureStamp] No existing signature request found, creating new one...`);
      // Create a new signature request
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

      signatureRequest = await this.prisma.signatureRequest.create({
        data: {
          documentId,
          requesterId: userId,
          signatureType: SignatureType.ELECTRONIC,
          expiresAt,
          reason: reason || 'Document approval signature',
          status: SignatureStatus.SIGNED,
          signedAt: new Date(),
        },
      });
      this.logger.log(`[applySignatureStamp] Created new signature request ${signatureRequest.id}`);
    }

    // Get IP and User Agent
    let ipAddress: string | null | undefined = this.request?.ip;
    const xForwardedFor = this.request?.headers['x-forwarded-for'];
    if (!ipAddress && xForwardedFor) {
      if (Array.isArray(xForwardedFor)) {
        ipAddress = xForwardedFor[0];
      } else {
        ipAddress = xForwardedFor;
      }
    }
    const userAgent = this.request?.headers['user-agent'] || '';

    // Check if document already has a digital signature
    const existingSignature = await this.prisma.digitalSignature.findFirst({
      where: {
        requestId: signatureRequest.id,
      },
    });

    let digitalSignature: DigitalSignature;

    if (existingSignature) {
      this.logger.log(`[applySignatureStamp] Found existing digital signature ${existingSignature.id}, updating...`);
      // Update existing digital signature
      digitalSignature = await this.prisma.digitalSignature.update({
        where: { id: existingSignature.id },
        data: {
          signerId: userId,
          signatureStampId: signatureStampId,
          documentHash: documentHash,
          signatureHash: signatureHash,
          signatureStatus: 'VALID',
          verifiedAt: new Date(),
          ipAddress: ipAddress,
          userAgent: userAgent,
          signatureData: JSON.stringify({
            stampName: signatureStamp.name,
            stampImageUrl: signatureStamp.imageUrl,
            appliedAt: new Date().toISOString(),
            documentHash: documentHash,
          }),
          certificateInfo: {
            signatureStampId: signatureStampId,
            stampName: signatureStamp.name,
            appliedBy: userId,
            appliedAt: new Date().toISOString(),
            documentHash: documentHash,
            signatureAlgorithm: 'RSA-SHA256',
          } as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`[applySignatureStamp] Updated digital signature ${digitalSignature.id}`);
    } else {
      this.logger.log(`[applySignatureStamp] No existing digital signature found, creating new one...`);
      // Create new digital signature
      digitalSignature = await this.prisma.digitalSignature.create({
        data: {
          requestId: signatureRequest.id,
          signerId: userId,
          signatureStampId: signatureStampId,
          documentHash: documentHash,
          signatureHash: signatureHash,
          signatureStatus: 'VALID',
          verifiedAt: new Date(),
          ipAddress: ipAddress,
          userAgent: userAgent,
          signatureData: JSON.stringify({
            stampName: signatureStamp.name,
            stampImageUrl: signatureStamp.imageUrl,
            appliedAt: new Date().toISOString(),
            documentHash: documentHash,
          }),
          certificateInfo: {
            signatureStampId: signatureStampId,
            stampName: signatureStamp.name,
            appliedBy: userId,
            appliedAt: new Date().toISOString(),
            documentHash: documentHash,
            signatureAlgorithm: 'RSA-SHA256',
          } as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`[applySignatureStamp] Created new digital signature ${digitalSignature.id}`);
    }

    this.logger.log(`[applySignatureStamp] Successfully applied signature for document ${documentId}`);
    return digitalSignature;
  }

  /**
   * Extract S3 key from S3 URL
   */
  private extractS3Key(s3Url: string): string {
    try {
      const url = new URL(s3Url);
      // Handle both path-style and virtual-hosted-style URLs
      let key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
      // Remove bucket name if present in path
      const bucketName = process.env.AWS_S3_BUCKET_NAME;
      if (bucketName && key.startsWith(`${bucketName}/`)) {
        key = key.substring(bucketName.length + 1);
      }
      return key;
    } catch (error) {
      // If URL parsing fails, assume it's already a key
      return s3Url;
    }
  }

  async getDocumentSignatures(documentId: string): Promise<DigitalSignature[]> {
    // Get all signature requests for the document
    const signatureRequests = await this.prisma.signatureRequest.findMany({
      where: { documentId },
      include: {
        signatures: {
          include: {
            signer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            signatureStamp: true,
          },
        },
      },
    });

    // Flatten all signatures from all requests
    const allSignatures = signatureRequests.flatMap(request => request.signatures);
    return allSignatures as any;
  }

  /**
   * Verify digital signature integrity
   */
  async verifySignature(signatureId: string): Promise<{
    isValid: boolean;
    status: string;
    message: string;
    details: {
      currentHash?: string;
      originalHash?: string;
      hashMatch?: boolean;
      signatureValid?: boolean;
    };
  }> {
    // Get the digital signature
    const digitalSignature = await this.prisma.digitalSignature.findUnique({
      where: { id: signatureId },
      include: {
        request: {
          include: {
            document: {
              include: {
                assets: {
                  where: { isCover: false },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!digitalSignature) {
      throw new NotFoundException(`Digital signature with ID '${signatureId}' not found`);
    }

    if (!digitalSignature.documentHash || !digitalSignature.signatureHash) {
      return {
        isValid: false,
        status: 'INVALID',
        message: 'Signature does not contain hash information',
        details: {},
      };
    }

    const document = digitalSignature.request.document;
    if (!document.assets || document.assets.length === 0) {
      return {
        isValid: false,
        status: 'INVALID',
        message: 'Document file not found',
        details: {},
      };
    }

    try {
      const mainAsset = document.assets[0];
      const s3Key = this.extractS3Key(mainAsset.s3Url);

      // Verify the signature
      const verification = await this.cryptoService.verifyFileSignature(
        s3Key,
        digitalSignature.documentHash,
        digitalSignature.signatureHash,
      );

      // Update signature status in database
      const newStatus = verification.isValid ? 'VALID' : 'INVALID';
      await this.prisma.digitalSignature.update({
        where: { id: signatureId },
        data: {
          signatureStatus: newStatus,
          verifiedAt: new Date(),
        },
      });

      return {
        isValid: verification.isValid,
        status: newStatus,
        message: verification.isValid
          ? 'Signature is valid and document has not been modified'
          : verification.hashMatch
            ? 'Document hash matches but signature verification failed'
            : 'Document has been modified after signing',
        details: {
          currentHash: verification.currentHash,
          originalHash: digitalSignature.documentHash,
          hashMatch: verification.hashMatch,
          signatureValid: verification.isValid,
        },
      };
    } catch (error) {
      console.error('Signature verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        status: 'ERROR',
        message: 'Error verifying signature: ' + errorMessage,
        details: {},
      };
    }
  }
}
