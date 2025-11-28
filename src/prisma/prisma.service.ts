import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['query', 'info', 'warn', 'error'],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit() {
    await this.$connect();
    console.log('✅ Prisma connected to PostgreSQL database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('❌ Prisma disconnected from PostgreSQL database');
  }

  // Custom methods for security operations

  // Method to get user with role and department
  async getUserWithRelations(userId: string) {
    return this.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        department: true,
      },
    });
  }

  // Method to get document with all relations
  async getDocumentWithRelations(documentId: string) {
    return this.document.findUnique({
      where: { id: documentId },
      include: {
        creator: {
          include: {
            role: true,
            department: true,
          },
        },
        approver: {
          include: {
            role: true,
            department: true,
          },
        },
        versions: {
          include: {
            creator: true,
          },
          orderBy: {
            versionNumber: 'desc',
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        comments: {
          include: {
            author: {
              include: {
                role: true,
                department: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        signatureRequests: {
          include: {
            requester: true,
            signatures: {
              include: {
                signer: true,
              },
            },
          },
        },
      },
    });
  }

  // Method for full-text search with security filtering
  async searchDocuments(searchTerm: string, userId: string, userRole: string) {
    const user = await this.getUserWithRelations(userId);

    // Base query with security filtering
    const whereClause: any = {
      OR: [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { documentNumber: { contains: searchTerm, mode: 'insensitive' } },
      ],
    };

    // Apply security level filtering based on user role
    if (userRole === 'ADMIN') {
      // Admin can see all documents
    } else if (userRole === 'MANAGER') {
      whereClause.securityLevel = {
        in: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
      };
    } else if (userRole === 'EMPLOYEE') {
      whereClause.OR = [
        ...whereClause.OR,
        {
          AND: [
            { securityLevel: { in: ['PUBLIC', 'INTERNAL'] } },
            {
              OR: [
                { creatorId: userId },
                { department: { id: user?.departmentId } }
              ],
            },
          ],
        },
      ];
    }

    return this.document.findMany({
      where: whereClause,
      include: {
        creator: {
          include: {
            role: true,
            department: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            versions: true,
            comments: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  // Method to check user permissions
  async checkUserPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
      },
    });

    if (!user?.role?.permissions) {
      return false;
    }

    const permissions = user.role.permissions as string[];
    return permissions.includes(permission);
  }

  // Method to get documents by security level
  async getDocumentsBySecurityLevel(securityLevel: string, userId: string) {
    const user = await this.getUserWithRelations(userId);

    if (!user) {
      throw new Error('User not found');
    }
    return this.document.findMany({
      where: {
        securityLevel: securityLevel as any,
        OR: [
          { creatorId: userId },
            // sonar-ignore-next-line
            // { departmentId: user.departmentId }
        ],
      },
      include: {
        creator: true,
        approver: true,
        versions: true,
        tags: true,
        comments: true,
        signatureRequests: true,
        auditLogs: true,
      },
    });
  }

  // Method to get audit logs with filtering
  async getAuditLogs(filters: {
    userId?: string;
    documentId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const whereClause: any = {};

    if (filters.userId) whereClause.userId = filters.userId;
    if (filters.documentId) whereClause.documentId = filters.documentId;
    if (filters.action) whereClause.action = filters.action;
    if (filters.resource) whereClause.resource = filters.resource;
    if (filters.startDate || filters.endDate) {
      whereClause.timestamp = {};
      if (filters.startDate) whereClause.timestamp.gte = filters.startDate;
      if (filters.endDate) whereClause.timestamp.lte = filters.endDate;
    }

    return this.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          include: {
            role: true,
            department: true,
          },
        },
        document: {
          select: {
            id: true,
            title: true,
            documentNumber: true,
            securityLevel: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });
  }

  // Run a function within a transaction and set Postgres LOCAL app context for audit triggers
  async runWithUserContext<T>(
    context: { userId?: string | null; role?: string | null; departmentId?: string | null },
    fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      const { userId, role, departmentId } = context;
      if (userId) {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_user_id = '${userId.replace(/'/g, "''")}'`);
      }
      if (role) {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_user_role = '${role.replace(/'/g, "''")}'`);
      }
      if (departmentId) {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_user_department = '${departmentId.replace(/'/g, "''")}'`);
      }
      return fn(tx);
    });
  }
}
