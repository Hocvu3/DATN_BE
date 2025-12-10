import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentStatus, Prisma } from '@prisma/client';

export interface CreateVersionDto {
  s3Key: string;
  s3Url: string;
  thumbnailUrl?: string;
  fileSize: number;
  checksum: string;
  mimeType: string;
  changeDescription?: string;
}

export interface UpdateVersionDto {
  status?: DocumentStatus;
  thumbnailUrl?: string;
}

@Injectable()
export class DocumentVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all versions for a document
   */
  async getVersionsByDocumentId(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
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
            _count: {
              select: {
                digitalSignatures: true,
              },
            },
          },
          orderBy: {
            versionNumber: 'desc',
          },
        },
        _count: {
          select: {
            versions: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID '${documentId}' not found`);
    }

    return document.versions;
  }

  /**
   * Get specific version details
   */
  async getVersionById(documentId: string, versionId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId: documentId,
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            documentNumber: true,
            securityLevel: true,
          },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
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

    if (!version) {
      throw new NotFoundException(`Version with ID '${versionId}' not found`);
    }

    return version;
  }

  /**
   * Get latest version for a document
   */
  async getLatestVersion(documentId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
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

    if (!version) {
      throw new NotFoundException(`No versions found for document '${documentId}'`);
    }

    return version;
  }

  /**
   * Create new version
   */
  async createVersion(
    documentId: string,
    userId: string,
    createVersionDto: CreateVersionDto,
  ) {
    // Verify document exists
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID '${documentId}' not found`);
    }

    // Get next version number
    const latestVersion = document.versions[0];
    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    // Create new version
    const newVersion = await this.prisma.documentVersion.create({
      data: {
        documentId,
        versionNumber: nextVersionNumber,
        filePath: `/documents/${documentId}/v${nextVersionNumber}`,
        s3Key: createVersionDto.s3Key,
        s3Url: createVersionDto.s3Url,
        thumbnailUrl: createVersionDto.thumbnailUrl,
        fileSize: createVersionDto.fileSize,
        checksum: createVersionDto.checksum,
        mimeType: createVersionDto.mimeType,
        status: DocumentStatus.DRAFT,
        creatorId: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Update document's updatedAt
    await this.prisma.document.update({
      where: { id: documentId },
      data: { updatedAt: new Date() },
    });

    return newVersion;
  }

  /**
   * Update version (edit mode - updates existing version)
   */
  async updateVersion(
    documentId: string,
    versionId: string,
    userId: string,
    updateData: UpdateVersionDto,
  ) {
    // Verify version exists and belongs to document
    const existingVersion = await this.prisma.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId: documentId,
      },
      include: {
        digitalSignatures: true,
      },
    });

    if (!existingVersion) {
      throw new NotFoundException(`Version with ID '${versionId}' not found`);
    }

    // Don't allow editing if version has signatures
    if (existingVersion.digitalSignatures.length > 0) {
      throw new BadRequestException('Cannot edit a signed version. Please create a new version instead.');
    }

    // Update version
    const updatedVersion = await this.prisma.documentVersion.update({
      where: { id: versionId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return updatedVersion;
  }

  /**
   * Update version status
   */
  async updateVersionStatus(
    documentId: string,
    versionId: string,
    status: DocumentStatus,
  ) {
    // Verify version exists
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId: documentId,
      },
    });

    if (!version) {
      throw new NotFoundException(`Version with ID '${versionId}' not found`);
    }

    // Update status
    return await this.prisma.documentVersion.update({
      where: { id: versionId },
      data: { status },
    });
  }

  /**
   * Delete version
   */
  async deleteVersion(documentId: string, versionId: string) {
    // Verify version exists and belongs to document
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: versionId,
        documentId: documentId,
      },
      include: {
        digitalSignatures: true,
        document: {
          include: {
            versions: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(`Version with ID '${versionId}' not found`);
    }

    // Don't allow deleting if it's the only version
    if (version.document.versions.length === 1) {
      throw new BadRequestException('Cannot delete the only version of a document');
    }

    // Don't allow deleting signed versions
    if (version.digitalSignatures.length > 0) {
      throw new BadRequestException('Cannot delete a signed version');
    }

    // Delete version
    await this.prisma.documentVersion.delete({
      where: { id: versionId },
    });

    return { message: 'Version deleted successfully' };
  }

  /**
   * Get version statistics
   */
  async getVersionStatistics(documentId: string) {
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        digitalSignatures: true,
      },
    });

    const stats = {
      totalVersions: versions.length,
      draftVersions: versions.filter(v => v.status === DocumentStatus.DRAFT).length,
      pendingVersions: versions.filter(v => v.status === DocumentStatus.PENDING_APPROVAL).length,
      approvedVersions: versions.filter(v => v.status === DocumentStatus.APPROVED).length,
      rejectedVersions: versions.filter(v => v.status === DocumentStatus.REJECTED).length,
      signedVersions: versions.filter(v => v.digitalSignatures.length > 0).length,
      latestVersion: versions.sort((a, b) => b.versionNumber - a.versionNumber)[0],
    };

    return stats;
  }

  /**
   * Compare two versions
   */
  async compareVersions(documentId: string, versionId1: string, versionId2: string) {
    const [version1, version2] = await Promise.all([
      this.getVersionById(documentId, versionId1),
      this.getVersionById(documentId, versionId2),
    ]);

    return {
      version1: {
        versionNumber: version1.versionNumber,
        status: version1.status,
        fileSize: version1.fileSize,
        createdAt: version1.createdAt,
        signatures: version1.digitalSignatures.length,
      },
      version2: {
        versionNumber: version2.versionNumber,
        status: version2.status,
        fileSize: version2.fileSize,
        createdAt: version2.createdAt,
        signatures: version2.digitalSignatures.length,
      },
      differences: {
        sizeDiff: version2.fileSize - version1.fileSize,
        timeDiff: version2.createdAt.getTime() - version1.createdAt.getTime(),
        statusChanged: version1.status !== version2.status,
      },
    };
  }
}
