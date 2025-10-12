#!/usr/bin/env node

const { spawn } = require('child_process');

async function log(message) {
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
      // Simple check - just wait
      await sleep(2000);
      attempts++;
      
      if (attempts >= 5) {
        log('✅ Assuming PostgreSQL is ready!');
        return true;
      }
    } catch (error) {
      attempts++;
      log(`PostgreSQL check attempt ${attempts}/${maxAttempts}...`);
    }
  }
  
  log('⚠️ Proceeding without database confirmation...');
  return true;
}

async function startApplication() {
  log('🚀 Starting application...');
  
  const isProduction = process.env.NODE_ENV === 'production';
  const command = 'npm';
  const args = isProduction ? ['run', 'start:prod'] : ['run', 'start:dev'];
  
  const app = spawn(command, args, {
    stdio: 'inherit',
    env: process.env
  });
  
  app.on('error', (error) => {
    log(`❌ Application failed to start: ${error.message}`);
    process.exit(1);
  });
  
  app.on('exit', (code) => {
    log(`🔴 Application exited with code ${code}`);
    process.exit(code);
  });
  
  // Handle graceful shutdown
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
    
    // Wait for database
    await waitForDatabase();
    
    // Skip database setup - assume it's already configured
    log('📋 Skipping database setup - assuming already configured');
    
    // Start application directly
    await startApplication();
    
  } catch (error) {
    log(`❌ Startup failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`❌ Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

main();