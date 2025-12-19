import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SignatureStampsService } from '../services/signature-stamps.service';
import { CreateSignatureDto } from '../dto/create-signature.dto';
import { UpdateSignatureDto } from '../dto/update-signature.dto';
import { GetSignaturesQueryDto } from '../dto/get-signatures-query.dto';
import { SignaturePresignedUrlDto } from '../dto/signature-presigned-url.dto';
import { ApplySignatureDto } from '../dto/apply-signature.dto';
import type { Signature, DigitalSignature } from '@prisma/client';
import type { SignatureStampWithCreator } from '../entities/signature-stamp.entity';

@ApiTags('Stamps')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stamps')
export class SignatureStampsController {
  constructor(private readonly signatureStampsService: SignatureStampsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create a new signature stamp',
    description: 'Create a new signature stamp for applying to documents. Admin only.',
  })
  @ApiCreatedResponse({
    description: 'Signature stamp created successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Signature stamp name already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createSignatureDto: CreateSignatureDto,
  ): Promise<Signature> {
    return this.signatureStampsService.create(createSignatureDto, req.user.userId);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get all signature stamps',
    description: 'Retrieve a paginated list of signature stamps with optional filtering. Admin only.',
  })
  @ApiOkResponse({
    description: 'Signature stamps retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(
    @Query() query: GetSignaturesQueryDto,
  ): Promise<{ stamps: SignatureStampWithCreator[]; total: number; page: number; limit: number }> {
    return this.signatureStampsService.findAll(query);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get active signature stamps',
    description: 'Retrieve all active signature stamps. Available to authenticated users.',
  })
  @ApiOkResponse({
    description: 'Active signature stamps retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getActive(): Promise<SignatureStampWithCreator[]> {
    return this.signatureStampsService.getActiveSignatures();
  }

  @Get('requests')
  @ApiOperation({
    summary: 'Get signature requests for stamping',
    description: 'Retrieve all documents with pending signature requests that need stamps to be applied.',
  })
  @ApiOkResponse({
    description: 'Signature requests retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getSignatureRequests(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: { page?: number; limit?: number; status?: string },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    if (query.status) {
      where.status = query.status;
    }

    // Get signature requests with document details
    const [requests, total] = await Promise.all([
      this.signatureStampsService['prisma'].signatureRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          requestedAt: 'desc',
        },
        include: {
          documentVersion: {
            include: {
              document: {
                include: {
                  creator: {
                    select: {
                      id: true,
                      email: true,
                      username: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                  tags: {
                    select: {
                      tag: {
                        select: {
                          id: true,
                          name: true,
                          color: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          requester: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.signatureStampsService['prisma'].signatureRequest.count({ where }),
    ]);

    // Format response
    const formattedRequests = requests.map((req) => ({
      id: req.id,
      status: req.status,
      signatureType: req.signatureType,
      requestedAt: req.requestedAt,
      signedAt: req.signedAt,
      expiresAt: req.expiresAt,
      reason: req.reason,
      documentVersion: {
        id: req.documentVersion.id,
        versionNumber: req.documentVersion.versionNumber,
        status: req.documentVersion.status,
        s3Key: req.documentVersion.s3Key,
        s3Url: req.documentVersion.s3Url,
      },
      document: {
        id: req.documentVersion.document.id,
        title: req.documentVersion.document.title,
        documentNumber: req.documentVersion.document.documentNumber,
        securityLevel: req.documentVersion.document.securityLevel,
        creator: req.documentVersion.document.creator,
        tags: req.documentVersion.document.tags.map((t) => t.tag),
      },
      requester: req.requester,
    }));

    return {
      success: true,
      message: 'Signature requests retrieved successfully',
      data: {
        requests: formattedRequests,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get signature stamp by ID',
    description: 'Retrieve a single signature stamp by its ID. Admin only.',
  })
  @ApiParam({ name: 'id', description: 'Signature stamp ID', type: 'string' })
  @ApiOkResponse({
    description: 'Signature stamp retrieved successfully',
  })
  @ApiNotFoundResponse({ description: 'Signature stamp not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findById(@Param('id') id: string): Promise<SignatureStampWithCreator> {
    return this.signatureStampsService.findById(id);
  }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update signature stamp',
    description: 'Update an existing signature stamp. Admin only.',
  })
  @ApiParam({ name: 'id', description: 'Signature stamp ID', type: 'string' })
  @ApiOkResponse({
    description: 'Signature stamp updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiNotFoundResponse({ description: 'Signature stamp not found' })
  @ApiConflictResponse({ description: 'Signature stamp name already exists' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id') id: string,
    @Body() updateSignatureDto: UpdateSignatureDto,
  ): Promise<Signature> {
    return this.signatureStampsService.update(id, updateSignatureDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete signature stamp',
    description: 'Delete a signature stamp and its associated image from S3. Admin only.',
  })
  @ApiParam({ name: 'id', description: 'Signature stamp ID', type: 'string' })
  @ApiOkResponse({
    description: 'Signature stamp deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Signature stamp not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.signatureStampsService.delete(id);
  }

  @Post('presigned-url')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Generate presigned URL for signature image upload',
    description: 'Generate a presigned URL for uploading signature stamp images to S3. The frontend can use this URL to upload images directly to S3 without going through the backend. After upload, include the returned publicUrl and key when creating the signature stamp record.',
  })
  @ApiCreatedResponse({
    description: 'Presigned URL generated successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getPresignedUrl(
    @Body() body: SignaturePresignedUrlDto,
  ): Promise<{ presignedUrl: string; key: string; publicUrl: string }> {
    return this.signatureStampsService.generatePresignedUrl(body.fileName, body.contentType);
  }

  @Post('apply')
  @ApiOperation({
    summary: 'Apply signature stamp to document',
    description: 'Apply a signature stamp to a document during approval process. Creates a digital signature with the selected stamp.',
  })
  @ApiCreatedResponse({
    description: 'Signature stamp applied successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data or inactive signature stamp' })
  @ApiNotFoundResponse({ description: 'Signature stamp or document not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async applySignature(
    @Req() req: { user: { userId: string; role: string } },
    @Body() applySignatureDto: ApplySignatureDto,
  ): Promise<DigitalSignature> {
    return this.signatureStampsService.applySignatureStamp(
      applySignatureDto,
      req.user.userId,
      req.user.role,
    );
  }

  @Get('documents/:documentId/signatures')
  @ApiOperation({
    summary: 'Get signatures for document',
    description: 'Retrieve all digital signatures applied to a specific document.',
  })
  @ApiParam({ name: 'documentId', description: 'Document ID', type: 'string' })
  @ApiOkResponse({
    description: 'Document signatures retrieved successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getDocumentSignatures(@Param('documentId') documentId: string): Promise<DigitalSignature[]> {
    return this.signatureStampsService.getDocumentSignatures(documentId);
  }

  @Post('verify/:signatureId')
  @ApiOperation({
    summary: 'Verify digital signature',
    description: 'Verify the integrity of a digital signature and detect if document has been modified.',
  })
  @ApiParam({ name: 'signatureId', description: 'Digital signature ID', type: 'string' })
  @ApiOkResponse({
    description: 'Signature verification completed',
  })
  @ApiNotFoundResponse({ description: 'Signature not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async verifySignature(
    @Param('signatureId') signatureId: string,
  ): Promise<{
    isValid: boolean;
    status: string;
    message: string;
    details: any;
  }> {
    return this.signatureStampsService.verifySignature(signatureId);
  }
}
