import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TagRepository } from './repositories/tag.repository';
import { TagService } from './services/tag.service';
import { TagController } from './controllers/tag.controller';
import { DocumentTagController } from './controllers/document-tag.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TagController, DocumentTagController],
  providers: [TagRepository, TagService],
  exports: [TagService, TagRepository],
})
export class TagsModule {}
