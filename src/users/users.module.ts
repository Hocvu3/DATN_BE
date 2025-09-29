import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminController } from './admin.controller';
import { ManagerController } from './manager.controller';
import { DepartmentController } from './department.controller';

@Module({
  imports: [PrismaModule, S3Module],
  controllers: [UsersController, AdminController, ManagerController, DepartmentController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
