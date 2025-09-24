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
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SignatureService } from '../services/signature.service';
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

@ApiTags('Digital Signatures')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('signatures')
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Post('requests')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Create signature request',
    description: 'Create a new signature request for a document. All roles can create signature requests.'
  })
  @ApiCreatedResponse({
    description: 'Signature request created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'sig-req-123' },
        status: { type: 'string', example: 'PENDING' },
        signatureType: { type: 'string', example: 'ELECTRONIC' },
        requestedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string', example: 'Document requires approval' },
        document: { type: 'object' },
        requester: { type: 'object' },
        signatures: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid input data or expiration date in the past' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createSignatureRequest(
    @Req() req: { user: { userId: string; role: string } },
    @Body() createSignatureRequestDto: CreateSignatureRequestDto,
  ): Promise<SignatureRequestEntity> {
    return this.signatureService.createSignatureRequest(createSignatureRequestDto, req.user.userId);
  }

  @Get('requests')
  @ApiOperation({
    summary: 'Get signature requests',
    description: 'Retrieve a paginated list of signature requests with optional filtering'
  })
  @ApiOkResponse({
    description: 'Signature requests retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        requests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              signatureType: { type: 'string' },
              requestedAt: { type: 'string', format: 'date-time' },
              expiresAt: { type: 'string', format: 'date-time' },
              signedAt: { type: 'string', format: 'date-time' },
              reason: { type: 'string' },
              document: { type: 'object' },
              requester: { type: 'object' },
              signatures: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' }
      }
    }
  })
  @ApiQuery({ name: 'documentId', required: false, description: 'Filter by document ID' })
  @ApiQuery({ name: 'requesterId', required: false, description: 'Filter by requester ID' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'SIGNED', 'EXPIRED', 'REJECTED'] })
  @ApiQuery({ name: 'signatureType', required: false, enum: ['ELECTRONIC', 'DIGITAL', 'BIOMETRIC'] })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by date to (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['requestedAt', 'expiresAt', 'signedAt', 'status'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getSignatureRequests(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetSignatureRequestsQueryDto,
  ): Promise<{ requests: SignatureRequestWithDetails[]; total: number; page: number; limit: number }> {
    return this.signatureService.getSignatureRequests(query, req.user.userId, req.user.role);
  }

  @Get('requests/pending')
  @ApiOperation({
    summary: 'Get pending signature requests',
    description: 'Get signature requests that are pending and can be signed by the current user'
  })
  @ApiOkResponse({
    description: 'Pending signature requests retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', example: 'PENDING' },
          signatureType: { type: 'string' },
          requestedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          reason: { type: 'string' },
          document: { type: 'object' },
          requester: { type: 'object' }
        }
      }
    }
  })
  async getPendingSignatureRequests(
    @Req() req: { user: { userId: string; role: string } },
  ): Promise<SignatureRequestEntity[]> {
    return this.signatureService.getPendingSignatureRequests(req.user.userId);
  }

  @Get('requests/my-requests')
  @ApiOperation({
    summary: 'Get my signature requests',
    description: 'Get signature requests created by the current user'
  })
  @ApiOkResponse({
    description: 'User signature requests retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          signatureType: { type: 'string' },
          requestedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          signedAt: { type: 'string', format: 'date-time' },
          reason: { type: 'string' },
          document: { type: 'object' },
          requester: { type: 'object' },
          signatures: { type: 'array', items: { type: 'object' } }
        }
      }
    }
  })
  async getMySignatureRequests(
    @Req() req: { user: { userId: string; role: string } },
  ): Promise<SignatureRequestEntity[]> {
    return this.signatureService.getSignatureRequestsByRequester(req.user.userId, req.user.userId, req.user.role);
  }

  @Get('requests/:id')
  @ApiOperation({
    summary: 'Get signature request by ID',
    description: 'Retrieve a specific signature request by its ID'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiOkResponse({
    description: 'Signature request retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        signatureType: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        signedAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
        document: { type: 'object' },
        requester: { type: 'object' },
        signatures: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getSignatureRequestById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<SignatureRequestEntity> {
    return this.signatureService.getSignatureRequestById(id, req.user.userId, req.user.role);
  }

  @Put('requests/:id')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Update signature request',
    description: 'Update an existing signature request. Only the requester or admin can update.'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiOkResponse({
    description: 'Signature request updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        signatureType: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
        document: { type: 'object' },
        requester: { type: 'object' },
        signatures: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid input data or request cannot be updated' })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async updateSignatureRequest(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateSignatureRequestDto: UpdateSignatureRequestDto,
  ): Promise<SignatureRequestEntity> {
    return this.signatureService.updateSignatureRequest(id, updateSignatureRequestDto, req.user.userId, req.user.role);
  }

  @Put('requests/:id/status')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Update signature request status',
    description: 'Update the status of a signature request (approve, reject, etc.)'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiOkResponse({
    description: 'Signature request status updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        signatureType: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        signedAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
        document: { type: 'object' },
        requester: { type: 'object' },
        signatures: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid status or request cannot be updated' })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async updateSignatureStatus(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() updateSignatureStatusDto: UpdateSignatureStatusDto,
  ): Promise<SignatureRequestEntity> {
    return this.signatureService.updateSignatureStatus(id, updateSignatureStatusDto, req.user.userId, req.user.role);
  }

  @Post('requests/:id/approve')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Approve signature request',
    description: 'Approve a signature request. Only administrators can approve requests.'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiOkResponse({
    description: 'Signature request approved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', example: 'SIGNED' },
        signatureType: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        signedAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
        document: { type: 'object' },
        requester: { type: 'object' },
        signatures: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiForbiddenResponse({ description: 'Only administrators can approve requests' })
  async approveSignatureRequest(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<SignatureRequestEntity> {
    return this.signatureService.approveSignatureRequest(id, req.user.userId, req.user.role);
  }

  @Post('requests/:id/reject')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reject signature request',
    description: 'Reject a signature request with a reason. Only administrators can reject requests.'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiOkResponse({
    description: 'Signature request rejected successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', example: 'REJECTED' },
        signatureType: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
        document: { type: 'object' },
        requester: { type: 'object' },
        signatures: { type: 'array', items: { type: 'object' } }
      }
    }
  })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiForbiddenResponse({ description: 'Only administrators can reject requests' })
  async rejectSignatureRequest(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() body: { reason: string },
  ): Promise<SignatureRequestEntity> {
    return this.signatureService.rejectSignatureRequest(id, body.reason, req.user.userId, req.user.role);
  }

  @Delete('requests/:id')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete signature request',
    description: 'Delete a signature request. Only the requester or admin can delete.'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiResponse({ status: 204, description: 'Signature request deleted successfully' })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiBadRequestResponse({ description: 'Signed requests cannot be deleted' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async deleteSignatureRequest(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<void> {
    return this.signatureService.deleteSignatureRequest(id, req.user.userId, req.user.role);
  }

  // ===== DIGITAL SIGNATURE OPERATIONS =====
  @Post('requests/:id/sign')
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Sign document',
    description: 'Sign a document using digital signature. User must have permission to sign the document.'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiCreatedResponse({
    description: 'Document signed successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        signatureData: { type: 'string' },
        certificateInfo: { type: 'object' },
        signedAt: { type: 'string', format: 'date-time' },
        ipAddress: { type: 'string' },
        userAgent: { type: 'string' },
        request: { type: 'object' },
        signer: { type: 'object' }
      }
    }
  })
  @ApiBadRequestResponse({ description: 'Invalid signature data or request cannot be signed' })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiConflictResponse({ description: 'Document already signed by this user' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions to sign this document' })
  async signDocument(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
    @Body() signDocumentDto: SignDocumentDto,
  ): Promise<DigitalSignatureEntity> {
    return this.signatureService.signDocument(id, signDocumentDto, req.user.userId, req.user.role);
  }

  @Get('signatures/:id')
  @ApiOperation({
    summary: 'Get digital signature by ID',
    description: 'Retrieve a specific digital signature by its ID'
  })
  @ApiParam({ name: 'id', description: 'Digital signature ID' })
  @ApiOkResponse({
    description: 'Digital signature retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        signatureData: { type: 'string' },
        certificateInfo: { type: 'object' },
        signedAt: { type: 'string', format: 'date-time' },
        ipAddress: { type: 'string' },
        userAgent: { type: 'string' },
        request: { type: 'object' },
        signer: { type: 'object' }
      }
    }
  })
  @ApiNotFoundResponse({ description: 'Digital signature not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getDigitalSignatureById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<DigitalSignatureEntity> {
    return this.signatureService.getDigitalSignatureById(id, req.user.userId, req.user.role);
  }

  @Get('requests/:id/signatures')
  @ApiOperation({
    summary: 'Get signatures for request',
    description: 'Get all digital signatures for a specific signature request'
  })
  @ApiParam({ name: 'id', description: 'Signature request ID' })
  @ApiOkResponse({
    description: 'Digital signatures retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          signatureData: { type: 'string' },
          certificateInfo: { type: 'object' },
          signedAt: { type: 'string', format: 'date-time' },
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' },
          signer: { type: 'object' }
        }
      }
    }
  })
  @ApiNotFoundResponse({ description: 'Signature request not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getDigitalSignaturesByRequestId(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ): Promise<DigitalSignatureEntity[]> {
    return this.signatureService.getDigitalSignaturesByRequestId(id, req.user.userId, req.user.role);
  }

  // ===== STATISTICS =====
  @Get('stats')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get signature statistics',
    description: 'Get statistics about signature requests. Only administrators can access this endpoint.'
  })
  @ApiOkResponse({
    description: 'Signature statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalRequests: { type: 'number' },
        pendingRequests: { type: 'number' },
        signedRequests: { type: 'number' },
        expiredRequests: { type: 'number' },
        rejectedRequests: { type: 'number' }
      }
    }
  })
  @ApiForbiddenResponse({ description: 'Only administrators can view statistics' })
  async getSignatureStats(
    @Req() req: { user: { userId: string; role: string } },
  ): Promise<SignatureStats> {
    return this.signatureService.getSignatureStats(req.user.role);
  }

  // ===== UTILITY OPERATIONS =====
  @Post('cleanup/expired')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Mark expired requests',
    description: 'Mark expired signature requests as expired. Only administrators can run this operation.'
  })
  @ApiOkResponse({
    description: 'Expired requests marked successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: '5 expired requests marked' },
        count: { type: 'number', example: 5 }
      }
    }
  })
  @ApiForbiddenResponse({ description: 'Only administrators can run cleanup operations' })
  async markExpiredRequests(
    @Req() req: { user: { userId: string; role: string } },
  ): Promise<{ message: string; count: number }> {
    const count = await this.signatureService.markExpiredRequests();
    return {
      message: `${count} expired requests marked`,
      count,
    };
  }
}
