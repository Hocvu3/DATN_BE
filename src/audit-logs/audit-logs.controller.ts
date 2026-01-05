import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  NotFoundException,
  StreamableFile,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';

@ApiTags('Admin - Audit Logs')
@Controller('admin/audit-logs')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get('my-activities')
  @ApiOperation({ summary: 'Get my own activity logs (Employee access)' })
  @ApiOkResponse({ description: 'Activity logs retrieved successfully' })
  async getMyActivities(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetAuditLogsQueryDto,
  ) {
    try {
      // Filter to only show logs for the current user with userType=2 (employee only)
      const result = await this.auditLogsService.getAuditLogs({
        ...query,
        userId: req.user.userId,
        userType: 2, // Only employee type
      });
      return {
        message: 'Activity logs retrieved successfully',
        ...result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to retrieve activity logs: ${errorMessage}`);
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get audit log statistics (Admin only)' })
  @ApiOkResponse({ description: 'Audit log statistics retrieved successfully' })
  async getAuditLogStats(
    @Req() req: { user: { userId: string; role: string } },
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access audit log statistics');
    }

    try {
      const stats = await this.auditLogsService.getAuditLogStats();
      return {
        message: 'Audit log statistics retrieved successfully',
        data: stats,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to retrieve audit log statistics: ${errorMessage}`);
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get audit logs with pagination and filters (Admin only)' })
  @ApiOkResponse({ description: 'Audit logs retrieved successfully' })
  async getAuditLogs(
    @Req() req: { user: { userId: string; role: string } },
    @Query() query: GetAuditLogsQueryDto,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access audit logs');
    }

    try {
      const result = await this.auditLogsService.getAuditLogs(query);
      return {
        message: 'Audit logs retrieved successfully',
        ...result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to retrieve audit logs: ${errorMessage}`);
    }
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export audit logs as CSV (Admin only)' })
  @ApiOkResponse({ description: 'Audit logs exported successfully' })
  async exportAuditLogs(
    @Req() req: { user: { userId: string; role: string } },
    @Res({ passthrough: true }) res: Response,
    @Query() query: GetAuditLogsQueryDto,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can export audit logs');
    }

    try {
      const logs = await this.auditLogsService.exportAuditLogs(query);
      
      // Convert to CSV
      const csv = this.convertToCSV(logs);
      const buffer = Buffer.from(csv, 'utf-8');
      
      const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      res.set({
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      
      return new StreamableFile(buffer, {
        type: 'text/csv',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to export audit logs: ${errorMessage}`);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get audit log by ID (Admin only)' })
  @ApiOkResponse({ description: 'Audit log retrieved successfully' })
  async getAuditLogById(
    @Req() req: { user: { userId: string; role: string } },
    @Param('id') id: string,
  ) {
    // Check if user is ADMIN
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Only administrators can access audit logs');
    }

    try {
      const log = await this.auditLogsService.getAuditLogById(id);
      
      if (!log) {
        throw new NotFoundException(`Audit log with ID ${id} not found`);
      }

      return {
        message: 'Audit log retrieved successfully',
        data: log,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to retrieve audit log: ${errorMessage}`);
    }
  }

  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) {
      return 'No data available';
    }

    // CSV Headers
    const headers = [
      'ID',
      'Action',
      'Resource',
      'Resource ID',
      'User ID',
      'User Email',
      'User Name',
      'IP Address',
      'User Agent',
      'Timestamp',
      'Details',
    ];

    // CSV Rows
    const rows = logs.map(log => [
      log.id,
      log.action,
      log.resource,
      log.resourceId,
      log.userId || '',
      log.user?.email || '',
      log.user ? `${log.user.firstName} ${log.user.lastName}` : '',
      log.ipAddress || '',
      log.userAgent || '',
      log.timestamp.toISOString(),
      JSON.stringify(log.details || {}),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  }
}
