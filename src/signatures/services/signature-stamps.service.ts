import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { SignatureStampsRepository } from '../repositories/signature-stamps.repository';
import { S3Service } from '../../s3/s3.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { CreateSignatureDto } from '../dto/create-signature.dto';
import { UpdateSignatureDto } from '../dto/update-signature.dto';
import { GetSignaturesQueryDto } from '../dto/get-signatures-query.dto';
import { ApplySignatureDto } from '../dto/apply-signature.dto';
import type { Signature, DigitalSignature } from '@prisma/client';
import type { SignatureStampWithCreator } from '../entities/signature-stamp.entity';
import { Logger } from '@nestjs/common';

@Injectable()
export class SignatureStampsService {
  private readonly logger = new Logger(SignatureStampsService.name);

  constructor(
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

    // Verify document exists and get latest version
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: {
            versionNumber: 'desc',
          },
          take: 1,
        },
      },
    });
    if (!document) {
      this.logger.error(`[applySignatureStamp] Document not found: ${documentId}`);
      throw new NotFoundException(`Document with ID '${documentId}' not found`);
    }
    this.logger.log(`[applySignatureStamp] Document validated: ${document.title}`);

    // Get latest document version
    const latestVersion = document.versions?.[0];
    if (!latestVersion) {
      this.logger.error(`[applySignatureStamp] No document versions found for document ${documentId}`);
      throw new BadRequestException('Document has no versions to sign');
    }
    this.logger.log(`[applySignatureStamp] Latest version: v${latestVersion.versionNumber} (ID: ${latestVersion.id})`);

    // Generate document hash and signature from latest version
    let documentHash: string | null = null;
    let signatureHash: string | null = null;
    
    try {
      const s3Key = latestVersion.s3Key;
      if (!s3Key) {
        this.logger.error(`[applySignatureStamp] No S3 key found for version ${latestVersion.id}`);
        throw new BadRequestException('Document version has no S3 key');
      }
      this.logger.log(`[applySignatureStamp] Using S3 key: ${s3Key}`);
      
      // Generate SHA-256 hash of the document version
      const { hash, signature } = await this.cryptoService.hashAndSignFile(s3Key);
      documentHash = hash;
      signatureHash = signature;
      this.logger.log(`[applySignatureStamp] Generated hashes - Document: ${documentHash?.substring(0, 20)}..., Signature: ${signatureHash?.substring(0, 20)}...`);
    } catch (error) {
      this.logger.error('[applySignatureStamp] Failed to generate document hash:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException('Failed to generate document hash: ' + errorMessage);
    }

    // Check if this version already has a signature from this user
    const existingSignature = await this.prisma.digitalSignature.findFirst({
      where: {
        documentVersionId: latestVersion.id,
        signerId: userId,
      },
    });

    let digitalSignature: DigitalSignature;

    if (existingSignature) {
      this.logger.log(`[applySignatureStamp] Found existing digital signature ${existingSignature.id}, updating...`);
      // Update existing digital signature (re-sign scenario)
      digitalSignature = await this.prisma.digitalSignature.update({
        where: { id: existingSignature.id },
        data: {
          signatureStampId: signatureStampId,
          documentHash: documentHash,
          signatureHash: signatureHash,
          signatureStatus: 'VALID',
          verifiedAt: new Date(),
          signatureData: JSON.stringify({
            stampName: signatureStamp.name,
            stampImageUrl: signatureStamp.imageUrl,
            appliedAt: new Date().toISOString(),
            documentHash: documentHash,
            versionNumber: latestVersion.versionNumber,
            signatureAlgorithm: 'RSA-SHA256',
          }),
        },
      });
      this.logger.log(`[applySignatureStamp] Updated digital signature ${digitalSignature.id}`);
    } else {
      this.logger.log(`[applySignatureStamp] No existing digital signature found, creating new one...`);
      // Create new digital signature
      digitalSignature = await this.prisma.digitalSignature.create({
        data: {
          signerId: userId,
          signatureStampId: signatureStampId,
          documentVersionId: latestVersion.id,
          documentHash: documentHash,
          signatureHash: signatureHash,
          signatureStatus: 'VALID',
          verifiedAt: new Date(),
          signatureData: JSON.stringify({
            stampName: signatureStamp.name,
            stampImageUrl: signatureStamp.imageUrl,
            appliedAt: new Date().toISOString(),
            documentHash: documentHash,
            versionNumber: latestVersion.versionNumber,
            signatureAlgorithm: 'RSA-SHA256',
          }),
        },
      });
      this.logger.log(`[applySignatureStamp] Created new digital signature ${digitalSignature.id}`);
    }

    // Update version status to APPROVED
    await this.prisma.documentVersion.update({
      where: { id: latestVersion.id },
      data: { status: 'APPROVED' },
    });
    this.logger.log(`[applySignatureStamp] Updated version ${latestVersion.id} status to APPROVED`);

    this.logger.log(`[applySignatureStamp] Successfully applied signature for document ${documentId}`);
    return digitalSignature;
  }

  async getDocumentSignatures(documentId: string): Promise<DigitalSignature[]> {
    // Get all versions with their signatures
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        digitalSignatures: {
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

    // Flatten all signatures from all versions
    const allSignatures = versions.flatMap(version => version.digitalSignatures);
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
    // Get the digital signature with version info
    const digitalSignature = await this.prisma.digitalSignature.findUnique({
      where: { id: signatureId },
      include: {
        documentVersion: {
          include: {
            document: true,
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

    const version = digitalSignature.documentVersion;
    if (!version || !version.s3Key) {
      return {
        isValid: false,
        status: 'INVALID',
        message: 'Document version file not found',
        details: {},
      };
    }

    try {
      // Verify the signature using the version's S3 key
      const verification = await this.cryptoService.verifyFileSignature(
        version.s3Key,
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
