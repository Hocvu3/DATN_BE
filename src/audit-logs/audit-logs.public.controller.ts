import {
    Controller,
    Get,
    Query,
    Req,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogsService } from './audit-logs.service';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Audit Logs')
@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
export class PublicAuditLogsController {
    constructor(
        private readonly auditLogsService: AuditLogsService,
        private readonly prisma: PrismaService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Get audit logs with RLS' })
    @ApiOkResponse({ description: 'Audit logs retrieved successfully' })
    async getAuditLogs(
        @Req() req: { user: { userId: string } },
        @Query() query: GetAuditLogsQueryDto,
    ) {
        const userId = req.user.userId;
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { role: true },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // RLS Logic
        if (user.role?.name !== 'ADMIN') {
            if (user.departmentId) {
                query.departmentId = user.departmentId;
            } else {
                // If user has no department, restrict to their own logs
                query.userId = userId;
            }
        }

        // Ensure departmentId is preserved in query if set
        if (user.departmentId) {
            query.departmentId = user.departmentId;
        }

        return this.auditLogsService.getAuditLogs(query);
    }
}
