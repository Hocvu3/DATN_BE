import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';
import { RlsContextInterceptor } from './common/interceptors/rls-context.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from public directory (for robots.txt)
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
  });

  if (process.env.NODE_ENV === 'development') {
    app.enableCors({
      origin: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Authorization,Accept,X-Requested-With',
      exposedHeaders: 'Authorization',
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable global JWT auth guard - ensures @Public() decorator works
  app.useGlobalGuards(new JwtAuthGuard(new Reflector()));

  // Get PrismaService instance for RLS interceptor
  const prismaService = app.get(PrismaService);

  // Apply global interceptors and filters
  app.useGlobalInterceptors(
    new RlsContextInterceptor(prismaService), // Set RLS context first
    new BigIntSerializerInterceptor(), // Run BigInt serializer
    new TransformInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const logger = new Logger('Application');
  process.on('unhandledRejection', reason => {
    logger.error(`Unhandled Promise Rejection: ${String(reason)}`);
  });

  // Set global prefix for all routes BEFORE Swagger
  app.setGlobalPrefix('api');

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('DMS API Documentation')
    .setDescription('Document Management System API with PostgreSQL Security')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'access-token',
    )
    // .addServer('/api') // Add API prefix for all Swagger calls
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Apply global security requirement so all routes default to bearer auth
  document.security = [{ 'access-token': [] }];
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      defaultModelsExpandDepth: -1,
      defaultModelExpandDepth: 3,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  // Use Helmet for security headers - DISABLE CSP for API server
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP completely for API
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Start server
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`App is running on: http://0.0.0.0:${port}`);
  console.log(`API endpoints available at: http://0.0.0.0:${port}/api`);
  console.log(`Swagger UI available at: http://0.0.0.0:${port}/api`);
}
void bootstrap();
