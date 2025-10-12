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
  log('⏳ Waiting for PostgreSQL to be ready...');

  let attempts = 0;
  const maxAttempts = 60; // Increase timeout

  while (attempts < maxAttempts) {
    attempts++;

    try {
      // Simple approach: try to run prisma generate to test connection
      await execAsync('npx prisma generate', { timeout: 10000 });

      // If generate works, try a simple query to test if DB is really ready
      await execAsync('npx prisma db push --accept-data-loss', { timeout: 15000 });

      log('✅ PostgreSQL is ready!');
      return;
    } catch (error) {
      log(`PostgreSQL not ready yet (attempt ${attempts}/${maxAttempts}). Waiting...`);

      if (attempts >= maxAttempts) {
        log('❌ PostgreSQL connection timeout');
        log(`Last error: ${error.message}`);
        throw new Error('PostgreSQL connection timeout');
      }

      await sleep(5000); // Increase wait time
    }
  }
}

async function setupDatabase() {
  try {
    log('🗄️ Setting up database...');

    // Schema is already pushed in waitForDatabase, so just try migrations and seed
    log('📋 Running migrations (if needed)...');
    try {
      await execAsync('npx prisma migrate deploy', { timeout: 30000 });
      log('✅ Migrations applied successfully!');
    } catch (migrateError) {
      if (migrateError.message.includes('P3005') || migrateError.message.includes('schema is not empty')) {
        log('⚠️ Database schema already exists (P3005). Skipping migrations...');
      } else {
        log(`⚠️ Migration error: ${migrateError.message}`);
      }
      log('🔄 Schema is already synchronized from db push, continuing...');
    }

    log('🌱 Seeding database...');
    try {
      await execAsync('npx prisma db seed', { timeout: 30000 });
      log('✅ Database seeded successfully!');
    } catch (seedError) {
      log(`⚠️ Seed error: ${seedError.message}`);
      log('⚠️ This is normal if seed data already exists...');
    }

    log('✅ Database setup completed!');
  } catch (error) {
    log(`⚠️ Database setup failed: ${error.message}`);
    log('🔄 Continuing with application startup anyway...');
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

    // Check environment
    const isDocker = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:');
    log(isDocker ? '🐳 Running in Docker environment' : '💻 Running in local environment');

    // Wait for PostgreSQL to be ready
    await waitForDatabase();

    // Run database setup (migrations + seed) - never crash here
    await setupDatabase();

    // Start application
    await startApplication();
  } catch (error) {
    log(`❌ Startup failed: ${error.message}`);
    log('🔄 Attempting to start application anyway...');
    
    // Try to start application even if database setup failed
    try {
      await startApplication();
    } catch (appError) {
      log(`❌ Application startup also failed: ${appError.message}`);
      process.exit(1);
    }
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
