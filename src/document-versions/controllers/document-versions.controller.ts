import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { DocumentVersionsService } from '../services/document-versions.service';
import type { CreateVersionDto, UpdateVersionDto } from '../services/document-versions.service';
import { DocumentStatus } from '@prisma/client';
import { SignatureService } from '../../signatures/services/signature.service';
import { SignatureStampsService } from '../../signatures/services/signature-stamps.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { NotificationType } from '@prisma/client';

@Controller('documents/:documentId/versions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentVersionsController {
  constructor(
    private readonly documentVersionsService: DocumentVersionsService,
    private readonly signatureService: SignatureService,
    private readonly signatureStampsService: SignatureStampsService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Get all versions for a document
   */
  @Get()
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async getVersions(@Param('documentId') documentId: string) {
    return this.documentVersionsService.getVersionsByDocumentId(documentId);
  }

  /**
   * Get specific version details
   */
  @Get(':versionId')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async getVersionById(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documentVersionsService.getVersionById(documentId, versionId);
  }

  /**
   * Get latest version
   */
  @Get('latest')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async getLatestVersion(@Param('documentId') documentId: string) {
    return this.documentVersionsService.getLatestVersion(documentId);
  }

  /**
   * Create new version
   */
  @Post()
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async createVersion(
    @Param('documentId') documentId: string,
    @Body() createVersionDto: CreateVersionDto,
    @Req() req: any,
  ) {
    const version = await this.documentVersionsService.createVersion(
      documentId,
      req.user.userId,
      createVersionDto,
    );

    // Send notification to admins about new document upload
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { department: true },
      });
      
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });

      if (user && document) {
        const userName = `${user.firstName} ${user.lastName}`;
        const notifications = await this.notificationsService.createForAdmins(
          NotificationType.DOCUMENT_UPDATED,
          'New Document Version Uploaded',
          `${userName} has uploaded version ${version.versionNumber} of document "${document.title}".`,
        );

        // Send real-time notification via WebSocket
        for (const notification of notifications) {
          await this.notificationsGateway.sendToUser(
            notification.recipientId,
            notification,
          );
        }
      }
    } catch (error) {
      // Don't fail the upload if notification fails
      console.error('Failed to send upload notification:', error);
    }

    return version;
  }

  /**
   * Update existing version (edit mode)
   */
  @Put(':versionId')
  @Roles('ADMIN', 'MANAGER')
  async updateVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() updateVersionDto: UpdateVersionDto,
    @Req() req: any,
  ) {
    return this.documentVersionsService.updateVersion(
      documentId,
      versionId,
      req.user.userId,
      updateVersionDto,
    );
  }

  /**
   * Update version status
   */
  @Put(':versionId/status')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async updateVersionStatus(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body('status') status: DocumentStatus,
    @Req() req: any,
  ) {
    return this.documentVersionsService.updateVersionStatus(documentId, versionId, status, req.user.userId);
  }

  /**
   * Delete version
   */
  @Delete(':versionId')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Req() req: any,
  ) {
    return this.documentVersionsService.deleteVersion(documentId, versionId, req.user.userId);
  }

  /**
   * Get version statistics
   */
  @Get('stats')
  @Roles('ADMIN', 'MANAGER')
  async getVersionStatistics(@Param('documentId') documentId: string) {
    return this.documentVersionsService.getVersionStatistics(documentId);
  }

  /**
   * Compare two versions
   */
  @Get('compare')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async compareVersions(
    @Param('documentId') documentId: string,
    @Query('version1') versionId1: string,
    @Query('version2') versionId2: string,
  ) {
    return this.documentVersionsService.compareVersions(documentId, versionId1, versionId2);
  }

  /**
   * Validate version integrity (authenticated)
   */
  @Get(':versionId/validate')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  async validateVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documentVersionsService.validateVersion(documentId, versionId);
  }

  /**
   * Validate version integrity (public - no auth required)
   */
  @Public()
  @Get(':versionId/validate-public')
  async validateVersionPublic(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documentVersionsService.validateVersion(documentId, versionId);
  }

  /**
   * Approve document version
   */
  @Post(':versionId/approve')
  @Roles('ADMIN', 'MANAGER')
  async approveVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() body: { signatureStampId?: string; reason?: string; type?: number },
    @Req() req: { user: { userId: string; role: string } },
  ) {
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: versionId },
      include: { 
        document: {
          include: {
            creator: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    if (version.documentId !== documentId) {
      throw new BadRequestException('Version does not belong to this document');
    }

    let result: any;

    // If signatureStampId is provided, apply stamp and create/update signature request
    if (body.signatureStampId) {
      result = await this.signatureStampsService.applySignatureStamp(
        {
          documentId: documentId,
          signatureStampId: body.signatureStampId,
          reason: body.reason || 'Document version approved',
          type: body.type || 2, // Default to type 2 for hash generation
        },
        req.user.userId,
        req.user.role,
      );

      return {
        success: true,
        message: 'Document version approved with signature stamp',
        data: {
          documentId,
          versionId,
          digitalSignature: result,
        },
      };
    } else {
      // Just approve without stamp - find or create signature request
      let signatureRequest = await this.prisma.signatureRequest.findFirst({
        where: {
          documentVersionId: versionId,
        },
      });

      if (signatureRequest) {
        // Update existing signature request
        signatureRequest = await this.prisma.signatureRequest.update({
          where: { id: signatureRequest.id },
          data: {
            status: 'SIGNED',
            signedAt: new Date(),
          },
        });
      } else {
        // Create new signature request
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        signatureRequest = await this.prisma.signatureRequest.create({
          data: {
            documentVersion: { connect: { id: versionId } },
            requester: { connect: { id: req.user.userId } },
            signatureType: 'DIGITAL',
            expiresAt: expiresAt,
            status: 'SIGNED',
            signedAt: new Date(),
            reason: body.reason || 'Document version approved',
          },
        });
      }

      // Update version status to APPROVED
      await this.prisma.documentVersion.update({
        where: { id: versionId },
        data: { status: 'APPROVED' },
      });

      // Send notification to document creator and their department manager
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: req.user.userId },
        });

        if (user) {
          const userName = `${user.firstName} ${user.lastName}`;
          const notifications = await this.notificationsService.createForCreatorAndManager(
            version.document.creatorId,
            NotificationType.APPROVAL_GRANTED,
            'Document Approved',
            `${userName} has approved version ${version.versionNumber} of document "${version.document.title}".`,
          );

          // Send real-time notification via WebSocket
          for (const notification of notifications) {
            await this.notificationsGateway.sendToUser(
              notification.recipientId,
              notification,
            );
          }
        }
      } catch (error) {
        // Don't fail the approval if notification fails
        console.error('Failed to send approval notification:', error);
      }

      return {
        success: true,
        message: 'Document version approved successfully',
        data: {
          documentId,
          versionId,
          signatureRequest,
        },
      };
    }
  }

  /**
   * Reject document version
   */
  @Post(':versionId/reject')
  @Roles('ADMIN', 'MANAGER')
  async rejectVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() body: { reason: string },
    @Req() req: { user: { userId: string; role: string } },
  ) {
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: versionId },
      include: { 
        document: {
          include: {
            creator: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    if (version.documentId !== documentId) {
      throw new BadRequestException('Version does not belong to this document');
    }

    // Find signature request for this version
    const signatureRequest = await this.prisma.signatureRequest.findFirst({
      where: {
        documentVersionId: versionId,
      },
    });

    if (signatureRequest) {
      // Use the reject logic from signature service
      await this.signatureService.rejectSignatureRequest(
        signatureRequest.id,
        body.reason,
        req.user.userId,
        req.user.role,
      );
    } else {
      // No signature request exists, just update version status to PENDING_APPROVAL
      await this.prisma.documentVersion.update({
        where: { id: versionId },
        data: { status: DocumentStatus.PENDING_APPROVAL },
      });
    }

    // Send notification to document creator and their department manager
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      if (user) {
        const userName = `${user.firstName} ${user.lastName}`;
        const notifications = await this.notificationsService.createForCreatorAndManager(
          version.document.creatorId,
          NotificationType.APPROVAL_REJECTED,
          'Document Rejected',
          `${userName} has rejected version ${version.versionNumber} of document "${version.document.title}". Reason: ${body.reason}`,
        );

        // Send real-time notification via WebSocket
        for (const notification of notifications) {
          await this.notificationsGateway.sendToUser(
            notification.recipientId,
            notification,
          );
        }
      }
    } catch (error) {
      // Don't fail the rejection if notification fails
      console.error('Failed to send rejection notification:', error);
    }

    return {
      success: true,
      message: 'Document version rejected successfully',
      data: {
        documentId,
        versionId,
      },
    };
  }
}
