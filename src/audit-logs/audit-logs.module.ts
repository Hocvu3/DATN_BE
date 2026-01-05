import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { PrismaModule } from '../prisma/prisma.module';

import { PublicAuditLogsController } from './audit-logs.public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuditLogsController, PublicAuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule { }
