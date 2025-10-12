#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDatabase() {
  const maxAttempts = 30;
  let attempts = 0;

  log('⏳ Waiting for PostgreSQL to be ready...');

  while (attempts < maxAttempts) {
    try {
      await execAsync('npx prisma db push --accept-data-loss', {
        env: { ...process.env },
        timeout: 10000,
      });
      log('✅ PostgreSQL is ready!');
      return true;
    } catch (error) {
      attempts++;
      log(`PostgreSQL not ready yet (attempt ${attempts}/${maxAttempts}). Waiting...`);
      await sleep(2000);
    }
  }

  throw new Error('❌ PostgreSQL connection timeout');
}

async function setupDatabase() {
  try {
    log('🗄️ Setting up fresh database...');

    // Generate Prisma client
    log('📋 Generating Prisma client...');
    await execAsync('npx prisma generate');

    // Run migrations for fresh database
    log('🔄 Running database migrations...');
    try {
      await execAsync('npx prisma migrate deploy');
      log('✅ Database migrations applied successfully!');
    } catch (migrateError) {
      log(`⚠️ Migration error: ${migrateError.message}`);
      log('🔄 Falling back to db push...');
      await execAsync('npx prisma db push --accept-data-loss');
      log('✅ Database schema synchronized!');
    }

    // Seed database
    log('🌱 Seeding database...');
    try {
      await execAsync('npx prisma db seed');
      log('✅ Database seeded successfully!');
    } catch (seedError) {
      log(`⚠️ Seed error: ${seedError.message}`);
      log('⚠️ Continuing without seed data...');
    }

    log('✅ Database setup completed!');
  } catch (error) {
    log(`❌ Database setup failed: ${error.message}`);
    log('⚠️ Continuing with application startup...');
  }
}

async function startApplication() {
  log('🚀 Starting application...');

  const isProduction = process.env.NODE_ENV === 'production';
  const command = 'npm';
  const args = isProduction ? ['run', 'start:prod'] : ['run', 'start:dev'];

  const app = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  app.on('error', error => {
    log(`❌ Application failed to start: ${error.message}`);
    process.exit(1);
  });

  app.on('exit', code => {
    log(`🔴 Application exited with code ${code}`);
    process.exit(code);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('🛑 Received SIGTERM, shutting down gracefully...');
    app.kill('SIGTERM');
  });

  process.on('SIGINT', () => {
    log('🛑 Received SIGINT, shutting down gracefully...');
    app.kill('SIGINT');
  });
}

async function main() {
  try {
    log('🚀 Starting Secure Document Management System...');

    const isDocker = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:');
    log(isDocker ? '🐳 Running in Docker environment' : '💻 Running in local environment');

    // Wait for database
    await waitForDatabase();

    // Setup database
    await setupDatabase();

    // Start application
    await startApplication();
  } catch (error) {
    log(`❌ Startup failed: ${error.message}`);
    process.exit(1);
  }
}

// Error handlers
process.on('uncaughtException', error => {
  log(`❌ Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

main();
