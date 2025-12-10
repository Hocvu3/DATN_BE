import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  SignatureRequestEntity,
  DigitalSignatureEntity,
  SignatureRequestWithDetails,
  SignatureStats,
} from '../entities/signature.entity';
import type { SignatureRequest, DigitalSignature, Prisma } from '@prisma/client';
import type { Prisma as PrismaNS } from '@prisma/client';

@Injectable()
export class SignatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===== SIGNATURE REQUEST CRUD OPERATIONS =====
  async createSignatureRequest(
    data: Prisma.SignatureRequestCreateInput,
    tx?: PrismaNS.TransactionClient,
  ): Promise<SignatureRequestEntity> {
    const prisma = (tx as any) || this.prisma;
    return prisma.signatureRequest.create({
      data,
      include: {
        requester: true,
      },
    });
  }

  async findSignatureRequestById(id: string): Promise<SignatureRequestEntity | null> {
    return this.prisma.signatureRequest.findUnique({
      where: { id },
      include: {
        requester: true,
      },
    });
  }

  async findSignatureRequestsByDocumentId(documentId: string): Promise<SignatureRequestEntity[]> {
    return this.prisma.signatureRequest.findMany({
      where: { documentId },
      include: {
        requester: true,
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
          requester: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
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
    }));

    return { requests: requestsWithDetails, total };
  }

  async updateSignatureRequest(
    id: string,
    data: Prisma.SignatureRequestUpdateInput,
    tx?: PrismaNS.TransactionClient,
  ): Promise<SignatureRequestEntity> {
    const prisma = (tx as any) || this.prisma;
    return prisma.signatureRequest.update({
      where: { id },
      data,
      include: {
        requester: true,
      },
    });
  }

  async deleteSignatureRequest(id: string, tx?: PrismaNS.TransactionClient): Promise<void> {
    const prisma = (tx as any) || this.prisma;
    await prisma.signatureRequest.delete({
      where: { id },
    });
  }

  // ===== DIGITAL SIGNATURE OPERATIONS =====
  async createDigitalSignature(
    data: Prisma.DigitalSignatureCreateInput,
    tx?: PrismaNS.TransactionClient,
  ): Promise<DigitalSignatureEntity> {
    const prisma = (tx as any) || this.prisma;
    return prisma.digitalSignature.create({
      data,
      include: {
        documentVersion: {
          include: {
            document: true,
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
        documentVersion: {
          include: {
            document: true,
          },
        },
        signer: true,
      },
    });
  }

  async findDigitalSignaturesByRequestId(documentVersionId: string): Promise<DigitalSignatureEntity[]> {
    return this.prisma.digitalSignature.findMany({
      where: { documentVersionId },
      include: {
        documentVersion: {
          include: {
            document: true,
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
        documentVersion: {
          include: {
            document: true,
          },
        },
        signer: true,
      },
      orderBy: { signedAt: 'desc' },
    });
  }

  // ===== UTILITY METHODS =====
  async getSignatureStats(): Promise<SignatureStats> {
    const [totalRequests, pendingRequests, signedRequests, expiredRequests, rejectedRequests] =
      await Promise.all([
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
        requester: true,
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
        requester: true,
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async findSignatureRequestsByRequester(requesterId: string): Promise<SignatureRequestEntity[]> {
    return this.prisma.signatureRequest.findMany({
      where: { requesterId },
      include: {
        requester: true,
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async checkIfUserCanSignRequest(documentVersionId: string, userId: string): Promise<boolean> {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { id: documentVersionId },
      include: {
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

    // Fetch document to check permissions
    const document = await this.prisma.document.findUnique({
      where: { id: request.documentId },
      select: { creatorId: true, approverId: true },
    });

    if (!document) {
      return false;
    }

    // Example logic: user can sign if they are the document creator, approver, or have ADMIN role
    return (
      document.creatorId === userId ||
      document.approverId === userId ||
      user.role?.name === 'ADMIN'
    );
  }
}
