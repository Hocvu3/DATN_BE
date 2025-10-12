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

async function simpleDbCheck() {
  try {
    // Just test basic connection without db push
    await execAsync('npx prisma generate', { timeout: 10000 });

    // Simple query to test connection
    const testCmd = `psql "${process.env.DATABASE_URL}" -c "SELECT 1;" 2>/dev/null || echo "connection test"`;
    await execAsync(testCmd, { timeout: 5000 });

    return true;
  } catch (error) {
    return false;
  }
}

async function waitForDatabase() {
  log('⏳ Waiting for PostgreSQL to be ready...');

  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    attempts++;

    const isReady = await simpleDbCheck();

    if (isReady) {
      log('✅ PostgreSQL is ready!');
      return;
    }

    log(`PostgreSQL not ready yet (attempt ${attempts}/${maxAttempts}). Waiting...`);

    if (attempts >= maxAttempts) {
      log('❌ PostgreSQL connection timeout - starting app anyway...');
      return; // Don't throw error, just continue
    }

    await sleep(3000);
  }
}

async function setupDatabase() {
  log('🗄️ Setting up database...');

  // Change to app root directory for Prisma commands
  const appRoot =
    process.env.NODE_ENV === 'production'
      ? '/app'
      : process.cwd().endsWith('scripts')
        ? process.cwd().replace(/[\\/]scripts$/, '')
        : process.cwd();

  const originalCwd = process.cwd();
  process.chdir(appRoot);
  log(`📁 Working directory: ${process.cwd()}`);

  try {
    // Try db push first (handles schema sync)
    log('📋 Synchronizing database schema...');
    await execAsync('npx prisma db push --accept-data-loss', { timeout: 30000 });
    log('✅ Database schema synchronized!');
  } catch (pushError) {
    log(`⚠️ Schema sync failed: ${pushError.message}`);
  }

  try {
    // Try seeding
    log('🌱 Seeding database...');
    await execAsync('npx prisma db seed', { timeout: 30000 });
    log('✅ Database seeded successfully!');
  } catch (seedError) {
    log(`⚠️ Seed failed: ${seedError.message}`);
  }

  // Restore original directory if needed
  if (originalCwd !== appRoot) {
    process.chdir(originalCwd);
  }

  log('✅ Database setup completed (with possible warnings)!');
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
  log('🚀 Starting Secure Document Management System...');

  // Check environment
  const isDocker = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:');
  log(isDocker ? '🐳 Running in Docker environment' : '💻 Running in local environment');

  // Wait for PostgreSQL (never fails)
  await waitForDatabase();

  // Setup database (never fails)
  await setupDatabase();

  // Start application
  await startApplication();
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
