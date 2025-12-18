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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { DocumentVersionsService } from '../services/document-versions.service';
import type { CreateVersionDto, UpdateVersionDto } from '../services/document-versions.service';
import { DocumentStatus } from '@prisma/client';

@Controller('documents/:documentId/versions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentVersionsController {
  constructor(private readonly documentVersionsService: DocumentVersionsService) {}

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
  @Roles('ADMIN', 'MANAGER')
  async createVersion(
    @Param('documentId') documentId: string,
    @Body() createVersionDto: CreateVersionDto,
    @Req() req: any,
  ) {
    return this.documentVersionsService.createVersion(documentId, req.user.userId, createVersionDto);
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
  @Roles('ADMIN', 'MANAGER')
  async updateVersionStatus(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body('status') status: DocumentStatus,
  ) {
    return this.documentVersionsService.updateVersionStatus(documentId, versionId, status);
  }

  /**
   * Delete version
   */
  @Delete(':versionId')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVersion(
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.documentVersionsService.deleteVersion(documentId, versionId);
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
}
