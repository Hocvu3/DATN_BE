import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditContextService } from './audit-context.service';

@Global()
@Module({
  providers: [PrismaService, AuditContextService],
  exports: [PrismaService, AuditContextService],
})
export class PrismaModule {}
