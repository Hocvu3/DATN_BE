import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditContextService {
  constructor(private prisma: PrismaService) {}

  /**
   * Set audit context for the current database session
   */
  async setAuditContext(
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT set_audit_context(
        ${userId || null}::TEXT,
        ${ipAddress || null}::TEXT,
        ${userAgent || null}::TEXT
      )
    `;
  }

  /**
   * Clear audit context
   */
  async clearAuditContext(): Promise<void> {
    await this.prisma.$executeRaw`SELECT clear_audit_context()`;
  }

  /**
   * Log read operation manually (since triggers don't capture reads)
   */
  async logReadOperation(
    resourceName: string,
    resourceId: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    additionalDetails?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT log_read_operation(
        ${resourceName}::TEXT,
        ${resourceId}::TEXT,
        ${userId || null}::TEXT,
        ${ipAddress || null}::TEXT,
        ${userAgent || null}::TEXT,
        ${additionalDetails ? JSON.stringify(additionalDetails) : null}::JSONB
      )
    `;
  }

  /**
   * Execute a function with audit context
   */
  async withAuditContext<T>(
    context: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      await this.setAuditContext(
        context.userId,
        context.ipAddress,
        context.userAgent,
      );
      return await operation();
    } finally {
      await this.clearAuditContext();
    }
  }
}