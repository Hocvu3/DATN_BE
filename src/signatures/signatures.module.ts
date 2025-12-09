import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { CryptoService } from '../common/services/crypto.service';
import { SignatureRepository } from './repositories/signature.repository';
import { SignatureStampsRepository } from './repositories/signature-stamps.repository';
import { SignatureService } from './services/signature.service';
import { SignatureStampsService } from './services/signature-stamps.service';
import { SignatureController } from './controllers/signature.controller';
import { SignatureStampsController } from './controllers/signature-stamps.controller';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [SignatureController, SignatureStampsController],
  providers: [
    SignatureRepository,
    SignatureStampsRepository,
    SignatureService,
    SignatureStampsService,
    CryptoService,
  ],
  exports: [SignatureService, SignatureStampsService, SignatureRepository, SignatureStampsRepository],
})
export class SignaturesModule {}
