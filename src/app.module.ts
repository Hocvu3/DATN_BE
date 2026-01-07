import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DocumentsModule } from './documents/documents.module';
import { DocumentVersionsModule } from './document-versions/document-versions.module';
import { S3Module } from './s3/s3.module';
import { TagsModule } from './tags/tags.module';
import { SignaturesModule } from './signatures/signatures.module';
import { OcrModule } from './ocr/ocr.module';
import { HealthModule } from './health/health.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        },
        defaults: { from: 'No Reply <no-reply@company.com>' },
        template: {
          dir: __dirname + '/templates',
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    DocumentVersionsModule,
    S3Module,
    TagsModule,
    SignaturesModule,
    OcrModule,
    HealthModule,
    AuditLogsModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
