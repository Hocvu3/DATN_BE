import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuditLogs(query: GetAuditLogsQueryDto) {
    const {
      page = 1,
      limit = 20,
      action,
      resource,
      resourceId,
      userId,
      ipAddress,
      startDate,
      endDate,
      search,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (resource) {
      where.resource = resource;
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (ipAddress) {
      where.ipAddress = ipAddress;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    if (search) {
      // Search in details JSON field - using raw query approach
      // Note: Prisma doesn't support JSON search well, so we skip this for now
      // Alternative: implement full-text search or use raw SQL
    }

    // Build orderBy clause
    const orderBy: Prisma.AuditLogOrderByWithRelationInput = {};
    if (sortBy === 'timestamp') {
      orderBy.timestamp = sortOrder;
    } else if (sortBy === 'action') {
      orderBy.action = sortOrder;
    } else if (sortBy === 'resource') {
      orderBy.resource = sortOrder;
    } else if (sortBy === 'userId') {
      orderBy.userId = sortOrder;
    }

    // Execute query
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAuditLogById(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        document: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async getAuditLogStats() {
    // Get statistics for dashboard
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLogs,
      last24HoursCount,
      last7DaysCount,
      last30DaysCount,
      actionStats,
      resourceStats,
      topUsers,
    ] = await Promise.all([
      // Total logs
      this.prisma.auditLog.count(),
      
      // Last 24 hours
      this.prisma.auditLog.count({
        where: { timestamp: { gte: last24Hours } },
      }),
      
      // Last 7 days
      this.prisma.auditLog.count({
        where: { timestamp: { gte: last7Days } },
      }),
      
      // Last 30 days
      this.prisma.auditLog.count({
        where: { timestamp: { gte: last30Days } },
      }),
      
      // Action statistics
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      
      // Resource statistics
      this.prisma.auditLog.groupBy({
        by: ['resource'],
        _count: { resource: true },
        orderBy: { _count: { resource: 'desc' } },
        take: 10,
      }),
      
      // Top users by activity
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
        where: { userId: { not: null } },
      }),
    ]);

    // Get user details for top users
    const userIds = topUsers.map(u => u.userId).filter(Boolean) as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });

    const topUsersWithDetails = topUsers.map(stat => {
      const user = users.find(u => u.id === stat.userId);
      return {
        userId: stat.userId,
        count: stat._count.userId,
        user,
      };
    });

    return {
      totalLogs,
      last24Hours: last24HoursCount,
      last7Days: last7DaysCount,
      last30Days: last30DaysCount,
      actionStats: actionStats.map(s => ({
        action: s.action,
        count: s._count.action,
      })),
      resourceStats: resourceStats.map(s => ({
        resource: s.resource,
        count: s._count.resource,
      })),
      topUsers: topUsersWithDetails,
    };
  }

  async exportAuditLogs(query: GetAuditLogsQueryDto) {
    const { where, orderBy } = this.buildQueryOptions(query);
    
    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy,
      include: {
        user: {
          select: {
            email: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return logs;
  }

  private buildQueryOptions(query: GetAuditLogsQueryDto) {
    const {
      action,
      resource,
      resourceId,
      userId,
      ipAddress,
      startDate,
      endDate,
      search,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (resourceId) where.resourceId = resourceId;
    if (userId) where.userId = userId;
    if (ipAddress) where.ipAddress = ipAddress;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    if (search) {
      // Search in details JSON field - using raw query approach
      // Note: Prisma doesn't support JSON search well, so we skip this for now
      // Alternative: implement full-text search or use raw SQL
    }

    const orderBy: Prisma.AuditLogOrderByWithRelationInput = {};
    if (sortBy === 'timestamp') orderBy.timestamp = sortOrder;
    else if (sortBy === 'action') orderBy.action = sortOrder;
    else if (sortBy === 'resource') orderBy.resource = sortOrder;
    else if (sortBy === 'userId') orderBy.userId = sortOrder;

    return { where, orderBy };
  }
}
