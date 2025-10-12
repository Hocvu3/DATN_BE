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

async function testDatabaseConnection() {
  log('🔍 Testing database connection...');

  try {
    // Test if PostgreSQL is listening on port 5432
    await execAsync('nc -z postgres 5432', { timeout: 5000 });
    log('✅ PostgreSQL port 5432 is open!');

    // Test if PostgreSQL accepts connections
    await execAsync('pg_isready -h postgres -p 5432 -U postgres', { timeout: 5000 });
    log('✅ PostgreSQL accepts connections!');

    return true;
  } catch (error) {
    log(`❌ Database connection test failed: ${error.message}`);
    return false;
  }
}

async function waitForDatabase() {
  log('⏳ Waiting for PostgreSQL to be ready...');

  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    attempts++;

    // Test database connection
    const isReady = await testDatabaseConnection();

    if (isReady) {
      log('✅ PostgreSQL is ready!');
      return;
    }

    log(`PostgreSQL not ready yet (attempt ${attempts}/${maxAttempts}). Waiting...`);

    if (attempts >= maxAttempts) {
      log('❌ PostgreSQL connection timeout');
      log('🔍 Checking container status...');
      try {
        const { stdout } = await execAsync('docker ps');
        log(`Docker containers: ${stdout}`);
      } catch (err) {
        log('Could not check docker status');
      }
      throw new Error('PostgreSQL connection timeout');
    }

    await sleep(2000);
  }
}

async function setupDatabase() {
  try {
    log('🗄️ Setting up database...');
    await execAsync('npm run db:setup');
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
    log(`Database URL: ${process.env.DATABASE_URL}`);

    // Wait for PostgreSQL to be ready
    await waitForDatabase();

    // Run database setup (migrations + seed)
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
