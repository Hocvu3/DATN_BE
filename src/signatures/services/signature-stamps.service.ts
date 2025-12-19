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
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';

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
  ): Promise<{ stamps: SignatureStampWithCreator[]; total: number; page: number; limit: number }> {
    const { signatures, total } = await this.signatureStampsRepository.findMany({
      search: query.search,
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });

    return {
      stamps: signatures,
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
    const { documentId, signatureStampId, reason, type = 1 } = applySignatureDto;

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

    // Get S3 key
    const s3Key = latestVersion.s3Key;
    if (!s3Key) {
      this.logger.error(`[applySignatureStamp] No S3 key found for version ${latestVersion.id}`);
      throw new BadRequestException('Document version has no S3 key');
    }
    this.logger.log(`[applySignatureStamp] Using S3 key: ${s3Key}`);

    // Download PDF from S3
    this.logger.log(`[applySignatureStamp] Downloading PDF from S3...`);
    const pdfBuffer = await this.s3Service.getFileBuffer(s3Key);
    this.logger.log(`[applySignatureStamp] Downloaded PDF, size: ${pdfBuffer.length} bytes`);

    // Download stamp image from S3
    this.logger.log(`[applySignatureStamp] Downloading stamp image from S3...`);
    const stampImageBuffer = await this.s3Service.getFileBuffer(signatureStamp.s3Key);
    this.logger.log(`[applySignatureStamp] Downloaded stamp image, size: ${stampImageBuffer.length} bytes`);

    // Process PDF: Insert stamp image
    this.logger.log(`[applySignatureStamp] Processing PDF to insert stamp...`);
    let modifiedPdfBuffer: Buffer;
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();

      // Embed stamp image
      let stampImage;
      const stampImageUrl = signatureStamp.imageUrl;
      if (stampImageUrl.toLowerCase().endsWith('.png')) {
        stampImage = await pdfDoc.embedPng(stampImageBuffer);
      } else if (stampImageUrl.toLowerCase().match(/\.(jpg|jpeg)$/)) {
        stampImage = await pdfDoc.embedJpg(stampImageBuffer);
      } else {
        throw new BadRequestException('Stamp image must be PNG or JPG format');
      }

      // Calculate stamp position (top-left corner with 1-2cm padding)
      const stampWidth = 150;
      const stampHeight = 75;
      // Convert cm to points (1 cm ≈ 28.35 points in PDF)
      const paddingCm = 1.5; // 1.5cm padding
      const padding = paddingCm * 28.35;
      const x = padding;
      const y = height - stampHeight - padding;

      // Draw stamp on first page
      firstPage.drawImage(stampImage, {
        x,
        y,
        width: stampWidth,
        height: stampHeight,
      });

      this.logger.log(`[applySignatureStamp] Stamp inserted at position (${x}, ${y})`);

      // Save modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);
      this.logger.log(`[applySignatureStamp] Modified PDF size: ${modifiedPdfBuffer.length} bytes`);
    } catch (error) {
      this.logger.error('[applySignatureStamp] Failed to process PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException('Failed to insert stamp into PDF: ' + errorMessage);
    }

    // Upload modified PDF back to S3 (replace the original)
    this.logger.log(`[applySignatureStamp] Uploading modified PDF to S3...`);
    try {
      await this.s3Service.uploadFileBuffer(
        modifiedPdfBuffer,
        s3Key,
        'application/pdf',
      );
      this.logger.log(`[applySignatureStamp] Modified PDF uploaded successfully`);
    } catch (error) {
      this.logger.error('[applySignatureStamp] Failed to upload modified PDF:', error);
      throw new BadRequestException('Failed to upload modified PDF to S3');
    }

    // Generate document hash only if type=2
    let documentHash: string | null = null;
    let signatureHash: string | null = null;
    
    if (type === 2) {
      try {
        const { hash, signature } = await this.cryptoService.hashAndSignFile(s3Key);
        documentHash = hash;
        signatureHash = signature;
        this.logger.log(`[applySignatureStamp] Generated hashes - Document: ${documentHash?.substring(0, 20)}..., Signature: ${signatureHash?.substring(0, 20)}...`);
      } catch (error) {
        this.logger.error('[applySignatureStamp] Failed to generate document hash:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new BadRequestException('Failed to generate document hash: ' + errorMessage);
      }
    } else {
      this.logger.log(`[applySignatureStamp] Type=${type}, skipping hash generation`);
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
      const updateData: any = {
        signatureStampId: signatureStampId,
        signatureStatus: 'VALID',
        verifiedAt: new Date(),
        signatureData: JSON.stringify({
          stampName: signatureStamp.name,
          stampImageUrl: signatureStamp.imageUrl,
          appliedAt: new Date().toISOString(),
          versionNumber: latestVersion.versionNumber,
          signatureAlgorithm: type === 2 ? 'RSA-SHA256' : 'STAMP_ONLY',
          reason: reason || 'Document stamped',
          type: type,
        }),
      };
      
      // Only include hashes if type=2
      if (type === 2) {
        updateData.documentHash = documentHash;
        updateData.signatureHash = signatureHash;
      }
      
      digitalSignature = await this.prisma.digitalSignature.update({
        where: { id: existingSignature.id },
        data: updateData,
      });
      this.logger.log(`[applySignatureStamp] Updated digital signature ${digitalSignature.id}`);
    } else {
      this.logger.log(`[applySignatureStamp] No existing digital signature found, creating new one...`);
      // Create new digital signature
      const createData: any = {
        signerId: userId,
        signatureStampId: signatureStampId,
        documentVersionId: latestVersion.id,
        signatureStatus: 'VALID',
        verifiedAt: new Date(),
        signatureData: JSON.stringify({
          stampName: signatureStamp.name,
          stampImageUrl: signatureStamp.imageUrl,
          appliedAt: new Date().toISOString(),
          versionNumber: latestVersion.versionNumber,
          signatureAlgorithm: type === 2 ? 'RSA-SHA256' : 'STAMP_ONLY',
          reason: reason || 'Document stamped',
          type: type,
        }),
      };
      
      // Only include hashes if type=2
      if (type === 2) {
        createData.documentHash = documentHash;
        createData.signatureHash = signatureHash;
      }
      
      digitalSignature = await this.prisma.digitalSignature.create({
        data: createData,
      });
      this.logger.log(`[applySignatureStamp] Created new digital signature ${digitalSignature.id}`);
    }

    // Find or create signature request for this document version
    let signatureRequest = await this.prisma.signatureRequest.findFirst({
      where: {
        documentVersionId: latestVersion.id,
      },
    });

    if (signatureRequest) {
      // Update existing signature request status
      await this.prisma.signatureRequest.update({
        where: { id: signatureRequest.id },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
        },
      });
      this.logger.log(`[applySignatureStamp] Updated existing signature request ${signatureRequest.id} status to SIGNED`);
    } else {
      // Create new signature request if doesn't exist
      this.logger.log(`[applySignatureStamp] No signature request found, creating new one...`);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      signatureRequest = await this.prisma.signatureRequest.create({
        data: {
          documentVersion: { connect: { id: latestVersion.id } },
          requester: { connect: { id: userId } },
          signatureType: 'DIGITAL',
          expiresAt: expiresAt,
          status: 'SIGNED',
          signedAt: new Date(),
          reason: reason || 'Auto-created during stamp application',
        },
      });
      this.logger.log(`[applySignatureStamp] Created new signature request ${signatureRequest.id}`);
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
