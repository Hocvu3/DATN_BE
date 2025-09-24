import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { 
  SignatureRequestEntity, 
  DigitalSignatureEntity, 
  SignatureRequestWithDetails,
  SignatureStats 
} from '../entities/signature.entity';
import type { SignatureRequest, DigitalSignature, Prisma } from '@prisma/client';

@Injectable()
export class SignatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===== SIGNATURE REQUEST CRUD OPERATIONS =====
  async createSignatureRequest(data: Prisma.SignatureRequestCreateInput): Promise<SignatureRequestEntity> {
    return this.prisma.signatureRequest.create({
      data,
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
    });
  }

  async findSignatureRequestById(id: string): Promise<SignatureRequestEntity | null> {
    return this.prisma.signatureRequest.findUnique({
      where: { id },
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
    });
  }

  async findSignatureRequestsByDocumentId(documentId: string): Promise<SignatureRequestEntity[]> {
    return this.prisma.signatureRequest.findMany({
      where: { documentId },
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findSignatureRequests(params: {
    documentId?: string;
    requesterId?: string;
    status?: string;
    signatureType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ requests: SignatureRequestWithDetails[]; total: number }> {
    const {
      documentId,
      requesterId,
      status,
      signatureType,
      dateFrom,
      dateTo,
      page = 1,
      limit = 10,
      sortBy = 'requestedAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.SignatureRequestWhereInput = {};
    
    if (documentId) {
      where.documentId = documentId;
    }

    if (requesterId) {
      where.requesterId = requesterId;
    }

    if (status) {
      where.status = status as any;
    }

    if (signatureType) {
      where.signatureType = signatureType as any;
    }

    if (dateFrom || dateTo) {
      where.requestedAt = {};
      if (dateFrom) {
        where.requestedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.requestedAt.lte = new Date(dateTo);
      }
    }

    // Build orderBy clause
    const orderBy: Prisma.SignatureRequestOrderByWithRelationInput = {};
    orderBy[sortBy as keyof Prisma.SignatureRequestOrderByWithRelationInput] = sortOrder;

    const [requests, total] = await Promise.all([
      this.prisma.signatureRequest.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              documentNumber: true,
              versions: {
                select: {
                  versionNumber: true,
                },
                orderBy: {
                  versionNumber: 'desc',
                },
                take: 1,
              },
            },
          },
          requester: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          signatures: {
            select: {
              id: true,
              signedAt: true,
              signer: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.signatureRequest.count({ where }),
    ]);

    // Transform to include version number
    const requestsWithDetails: SignatureRequestWithDetails[] = requests.map(request => ({
      ...request,
      document: {
        ...request.document,
        version: request.document.versions[0]?.versionNumber || 1,
      },
    }));

    return { requests: requestsWithDetails, total };
  }

  async updateSignatureRequest(id: string, data: Prisma.SignatureRequestUpdateInput): Promise<SignatureRequestEntity> {
    return this.prisma.signatureRequest.update({
      where: { id },
      data,
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
    });
  }

  async deleteSignatureRequest(id: string): Promise<void> {
    await this.prisma.signatureRequest.delete({
      where: { id },
    });
  }

  // ===== DIGITAL SIGNATURE OPERATIONS =====
  async createDigitalSignature(data: Prisma.DigitalSignatureCreateInput): Promise<DigitalSignatureEntity> {
    return this.prisma.digitalSignature.create({
      data,
      include: {
        request: {
          include: {
            document: true,
            requester: true,
          },
        },
        signer: true,
      },
    });
  }

  async findDigitalSignatureById(id: string): Promise<DigitalSignatureEntity | null> {
    return this.prisma.digitalSignature.findUnique({
      where: { id },
      include: {
        request: {
          include: {
            document: true,
            requester: true,
          },
        },
        signer: true,
      },
    });
  }

  async findDigitalSignaturesByRequestId(requestId: string): Promise<DigitalSignatureEntity[]> {
    return this.prisma.digitalSignature.findMany({
      where: { requestId },
      include: {
        request: {
          include: {
            document: true,
            requester: true,
          },
        },
        signer: true,
      },
      orderBy: { signedAt: 'desc' },
    });
  }

  async findDigitalSignaturesBySignerId(signerId: string): Promise<DigitalSignatureEntity[]> {
    return this.prisma.digitalSignature.findMany({
      where: { signerId },
      include: {
        request: {
          include: {
            document: true,
            requester: true,
          },
        },
        signer: true,
      },
      orderBy: { signedAt: 'desc' },
    });
  }

  // ===== UTILITY METHODS =====
  async getSignatureStats(): Promise<SignatureStats> {
    const [totalRequests, pendingRequests, signedRequests, expiredRequests, rejectedRequests] = await Promise.all([
      this.prisma.signatureRequest.count(),
      this.prisma.signatureRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.signatureRequest.count({ where: { status: 'SIGNED' } }),
      this.prisma.signatureRequest.count({ where: { status: 'EXPIRED' } }),
      this.prisma.signatureRequest.count({ where: { status: 'CANCELLED' } }),
    ]);

    return {
      totalRequests,
      pendingRequests,
      signedRequests,
      expiredRequests,
      rejectedRequests,
    };
  }

  async findExpiredSignatureRequests(): Promise<SignatureRequestEntity[]> {
    const now = new Date();
    return this.prisma.signatureRequest.findMany({
      where: {
        status: 'PENDING',
        expiresAt: {
          lt: now,
        },
      },
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
    });
  }

  async markExpiredRequests(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.signatureRequest.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return result.count;
  }

  async findPendingSignatureRequestsForUser(userId: string): Promise<SignatureRequestEntity[]> {
    return this.prisma.signatureRequest.findMany({
      where: {
        status: 'PENDING',
        expiresAt: {
          gt: new Date(),
        },
        // Add logic here to determine if user can sign this request
        // This might involve checking user roles, document permissions, etc.
      },
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async findSignatureRequestsByRequester(requesterId: string): Promise<SignatureRequestEntity[]> {
    return this.prisma.signatureRequest.findMany({
      where: { requesterId },
      include: {
        document: true,
        requester: true,
        signatures: {
          include: {
            request: true,
            signer: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async checkIfUserCanSignRequest(requestId: string, userId: string): Promise<boolean> {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { id: requestId },
      include: {
        document: {
          include: {
            creator: true,
            approver: true,
          },
        },
        requester: true,
      },
    });

    if (!request || request.status !== 'PENDING') {
      return false;
    }

    // Check if request is expired
    if (request.expiresAt < new Date()) {
      return false;
    }

    // Add business logic here to determine if user can sign
    // For example: user must be the document creator, approver, or have specific role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      return false;
    }

    // Example logic: user can sign if they are the document creator, approver, or have ADMIN role
    return (
      request.document.creatorId === userId ||
      request.document.approverId === userId ||
      user.role?.name === 'ADMIN'
    );
  }
}
