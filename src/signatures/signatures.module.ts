import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SignatureRepository } from './repositories/signature.repository';
import { SignatureService } from './services/signature.service';
import { SignatureController } from './controllers/signature.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SignatureController],
  providers: [SignatureRepository, SignatureService],
  exports: [SignatureService, SignatureRepository],
})
export class SignaturesModule {}
