#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function debugDatabase() {
  log('🔍 Debugging database connection...');

  log(`DATABASE_URL: ${process.env.DATABASE_URL}`);

  // Test 1: Basic connection
  try {
    log('Test 1: Basic psql connection...');
    await execAsync('psql --version', { timeout: 5000 });
    log('✅ psql is available');
  } catch (error) {
    log(`❌ psql not available: ${error.message}`);
  }

  // Test 2: Network connectivity
  try {
    log('Test 2: Network connectivity to postgres...');
    await execAsync('ping -c 1 postgres', { timeout: 5000 });
    log('✅ postgres host is reachable');
  } catch (error) {
    log(`❌ postgres host unreachable: ${error.message}`);
  }

  // Test 3: Port connectivity
  try {
    log('Test 3: Port 5432 connectivity...');
    await execAsync('nc -zv postgres 5432', { timeout: 5000 });
    log('✅ Port 5432 is open');
  } catch (error) {
    log(`❌ Port 5432 not accessible: ${error.message}`);
  }

  // Test 4: Prisma generate
  try {
    log('Test 4: Prisma generate...');
    await execAsync('npx prisma generate', { timeout: 10000 });
    log('✅ Prisma generate works');
  } catch (error) {
    log(`❌ Prisma generate failed: ${error.message}`);
  }

  // Test 5: Database connection via psql
  try {
    log('Test 5: Direct database connection...');
    await execAsync(`psql "${process.env.DATABASE_URL}" -c "SELECT 1;"`, { timeout: 10000 });
    log('✅ Direct database connection works');
  } catch (error) {
    log(`❌ Direct database connection failed: ${error.message}`);
  }

  // Test 6: Prisma db push
  try {
    log('Test 6: Prisma db push...');
    await execAsync('npx prisma db push --accept-data-loss', { timeout: 15000 });
    log('✅ Prisma db push works');
  } catch (error) {
    log(`❌ Prisma db push failed: ${error.message}`);
  }

  log('🏁 Debug completed!');
}

debugDatabase();
