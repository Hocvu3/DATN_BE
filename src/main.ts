import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS first, before any guards
  // Cors - More detailed configuration
  if (process.env.NODE_ENV === 'production') {
    // Prod: restrict to specific origins
    app.enableCors({
      origin: ['https://your-fe.vercel.app', 'https://your-custom-domain.com'],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
  } else {
    // Dev: allow all with more specific settings
    app.enableCors({
      origin: true, // Allow any origin
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type,Authorization,Accept',
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

  // Apply global interceptors and filters
  app.useGlobalInterceptors(
    new BigIntSerializerInterceptor(), // Run BigInt serializer first
    new TransformInterceptor()
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const logger = new Logger('Application');
  process.on('unhandledRejection', reason => {
    logger.error(`Unhandled Promise Rejection: ${String(reason)}`);
  });

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
    .addServer('/api') // Add API prefix for all Swagger calls
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

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Use Helmet for security headers with proper config
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      xFrameOptions: { action: 'deny' },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Start server
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`App is running on: http://localhost:${port}`);
  console.log(`API endpoints available at: http://localhost:${port}/api`);
  console.log(`Swagger UI available at: http://localhost:${port}/api`);
}
void bootstrap();
