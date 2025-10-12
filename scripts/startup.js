#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function log(message) {
  console.log(`${message}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDatabase() {
  log('⏳ Waiting for PostgreSQL...');

  const isDocker = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:');
  const dbHost = isDocker ? 'postgres' : 'localhost';
  const waitCmd = `pg_isready -h ${dbHost} -U postgres`;

  while (true) {
    try {
      await execAsync(waitCmd, { timeout: 5000 });
      log('✅ PostgreSQL is ready!');
      break;
    } catch (error) {
      log('PostgreSQL is unavailable - sleeping');
      await sleep(2000);
    }
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

async function applySecurityPolicies() {
  try {
    log('� Applying security policies...');
    
    const isDocker = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres:');
    const psqlCmd = isDocker 
      ? 'psql -U postgres -h postgres -d secure_document_management -f database/init.sql'
      : 'psql -U postgres -d secure_document_management -f database/init.sql';
    
    await execAsync(psqlCmd);
    log('✅ Security policies applied!');
  } catch (error) {
    log(`⚠️ Security policies failed: ${error.message}`);
    log('🔄 Continuing anyway...');
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

    // Run database setup (migrations + seed)
    await setupDatabase();

    // Apply security policies
    await applySecurityPolicies();

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
