import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { DocumentRepository } from './repositories/document.repository';
import { DocumentService } from './services/document.service';
import { DocumentController } from './controllers/document.controller';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [DocumentController],
  providers: [DocumentRepository, DocumentService],
  exports: [DocumentService, DocumentRepository],
})
export class DocumentsModule {}
