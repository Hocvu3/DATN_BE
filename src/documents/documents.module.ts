import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { CryptoService } from '../common/services/crypto.service';
import { DocumentRepository } from './repositories/document.repository';
import { DocumentService } from './services/document.service';
import { DocumentVersionsService } from './services/document-versions.service';
import { DocumentController } from './controllers/document.controller';
import { DocumentVersionsController } from './controllers/document-versions.controller';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [DocumentController, DocumentVersionsController],
  providers: [DocumentRepository, DocumentService, DocumentVersionsService, CryptoService],
  exports: [DocumentService, DocumentRepository, DocumentVersionsService],
})
export class DocumentsModule { }
