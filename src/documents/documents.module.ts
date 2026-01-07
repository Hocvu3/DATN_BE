import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CryptoService } from '../common/services/crypto.service';
import { DocumentRepository } from './repositories/document.repository';
import { DocumentService } from './services/document.service';
import { DocumentController } from './controllers/document.controller';

@Module({
  imports: [
    PrismaModule, 
    S3Module, 
    forwardRef(() => SignaturesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [DocumentController],
  providers: [DocumentRepository, DocumentService, CryptoService],
  exports: [DocumentService, DocumentRepository],
})
export class DocumentsModule { }
