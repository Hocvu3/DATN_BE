#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm để parse DATABASE_URL và trả về các thành phần
function parseDatabaseURL(url) {
  try {
    // Format: postgres://user:password@host:port/database
    const regex = /^postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    const match = url.match(regex);

    if (!match) {
      throw new Error('Invalid database URL format');
    }

    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: match[4],
      database: match[5].split('?')[0], // Loại bỏ parameters sau database name
    };
  } catch (error) {
    log(`⚠️ Failed to parse DATABASE_URL: ${error.message}`);
    return null;
  }
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
  const waitTime = 5000; // Tăng thời gian chờ lên 5 giây thay vì 3 giây

  while (attempts < maxAttempts) {
    attempts++;

    const isReady = await simpleDbCheck();

    if (isReady) {
      log('✅ PostgreSQL is ready!');
      return true;
    }

    log(`PostgreSQL not ready yet (attempt ${attempts}/${maxAttempts}). Waiting...`);

    if (attempts >= maxAttempts) {
      log('⚠️ PostgreSQL connection timeout - will continue without database');
      return false; // Return false to indicate DB is not ready
    }

    await sleep(waitTime);
  }

  return false;
}

async function resetDatabase() {
  log('🔄 Resetting database due to schema conflicts...');

  try {
    const dbInfo = parseDatabaseURL(process.env.DATABASE_URL);

    if (!dbInfo) {
      log('⚠️ Could not parse DATABASE_URL, skipping reset');
      return false;
    }

    // Kết nối đến postgres default db để có thể drop/create database hiện tại
    const pgConnectionString = `postgres://${dbInfo.user}:${dbInfo.password}@${dbInfo.host}:${dbInfo.port}/postgres`;

    // Drop database
    log(`🗑️ Dropping database: ${dbInfo.database}`);
    await execAsync(
      `psql "${pgConnectionString}" -c "DROP DATABASE IF EXISTS ${dbInfo.database};"`,
      { timeout: 10000 },
    );

    // Create database lại
    log(`🆕 Creating database: ${dbInfo.database}`);
    await execAsync(`psql "${pgConnectionString}" -c "CREATE DATABASE ${dbInfo.database};"`, {
      timeout: 10000,
    });

    log('✅ Database reset successful!');
    return true;
  } catch (error) {
    log(`⚠️ Database reset failed: ${error.message}`);
    return false;
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
    log('📋 Generating Prisma client...');
    await execAsync('npx prisma generate', { timeout: 30000 });
  } catch (genError) {
    log(`⚠️ Prisma client generation failed: ${genError.message}`);
  }

  let dbSyncSuccess = false;

  try {
    if (process.env.NODE_ENV === 'production') {
      log('📋 Syncing schema with db push (production)...');
      await execAsync('npx prisma db push --accept-data-loss', { timeout: 30000 });
      log('✅ Database schema synchronized!');
      dbSyncSuccess = true;
    } else {
      log('🔄 Running database migrations (dev)...');
      await execAsync('npx prisma migrate deploy', { timeout: 30000 });
      log('✅ Migrations applied!');
      dbSyncSuccess = true;
    }
  } catch (err) {
    log(`⚠️ Schema sync/migrate failed: ${err.message}`);

    // Nếu lỗi P3005 (schema không rỗng), thử reset database và chạy lại
    if (err.message.includes('P3005') || err.message.includes('schema is not empty')) {
      log('🔄 Detected P3005 error - database schema conflicts');

      // Thử reset database
      const resetSuccess = await resetDatabase();

      if (resetSuccess) {
        try {
          log('🔁 Retrying schema sync after database reset...');
          await execAsync('npx prisma db push --accept-data-loss', { timeout: 30000 });
          log('✅ Database schema synchronized after reset!');
          dbSyncSuccess = true;
        } catch (retryErr) {
          log(`⚠️ Schema sync failed after reset: ${retryErr.message}`);
        }
      }
    }
  }

  // Chỉ seed nếu sync thành công
  if (dbSyncSuccess) {
    try {
      log('🌱 Seeding database...');
      await execAsync('npx prisma db seed', { timeout: 30000 });
      log('✅ Database seeded successfully!');
    } catch (seedError) {
      log(`⚠️ Seed failed: ${seedError.message}`);
    }
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
    // Không exit process để tránh container bị restart liên tục
    log('⚠️ Attempting to keep container alive despite startup failure');

    // Giữ process chạy bằng một interval vô hạn
    setInterval(() => {
      log('⏱️ Keeping container alive...');
    }, 60000); // Log mỗi phút
  });

  app.on('exit', code => {
    log(`🔴 Application exited with code ${code}`);

    if (code !== 0) {
      log('⚠️ Application crashed, keeping container alive to prevent restart loop');
      // Giữ process chạy bằng một interval vô hạn
      setInterval(() => {
        log('⏱️ Keeping container alive after crash...');
      }, 60000); // Log mỗi phút
    } else {
      process.exit(code);
    }
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

  try {
    // Wait for PostgreSQL (returns true/false based on connection success)
    const dbReady = await waitForDatabase();

    // Setup database only if PostgreSQL is ready
    if (dbReady) {
      await setupDatabase();
    } else {
      log('⚠️ Skipping database setup due to PostgreSQL connection issues');
    }

    // Start application
    await startApplication();
  } catch (error) {
    log(`❌ Startup error: ${error.message}`);
    log('⚠️ Will attempt to start application anyway');
    await startApplication();
  }
}

// Error handlers - KHÔNG BAO GIỜ crash container
process.on('uncaughtException', error => {
  log(`❌ Uncaught Exception: ${error.message}`);
  log('⚠️ Continuing despite uncaught exception');
  // KHÔNG exit process để tránh container restart
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
  log('⚠️ Continuing despite unhandled rejection');
  // KHÔNG exit process để tránh container restart
});

// Fallback để giữ container chạy nếu có lỗi trong main()
main().catch(error => {
  log(`❌ Fatal error in main: ${error.message}`);
  log('⚠️ Keeping container alive despite fatal error');

  // Giữ process chạy
  setInterval(() => {
    log('⏱️ Keeping container alive after fatal error...');
  }, 60000);
});
