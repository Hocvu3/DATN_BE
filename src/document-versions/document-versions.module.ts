import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { DocumentVersionsController } from './controllers/document-versions.controller';
import { DocumentVersionsService } from './services/document-versions.service';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [DocumentVersionsController],
  providers: [DocumentVersionsService],
  exports: [DocumentVersionsService],
})
export class DocumentVersionsModule {}
