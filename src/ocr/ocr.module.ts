import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { S3Module } from '../s3/s3.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, S3Module, PrismaModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
