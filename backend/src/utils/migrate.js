// src/utils/migrate.js
// Run with: node src/utils/migrate.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  console.log('\n🗄️  Running database migration...\n');

  const schemaPath = path.join(__dirname, '../../..', 'schema.sql');
  // Also try local path
  const altPath = path.join(__dirname, '../..', 'schema.sql');
  const filePath = fs.existsSync(schemaPath) ? schemaPath : altPath;

  if (!fs.existsSync(filePath)) {
    console.error('❌ schema.sql not found at:', filePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Schema applied successfully.');
  } catch (err) {
    // Schema errors for "already exists" are typically safe to ignore on re-runs
    if (err.message.includes('already exists')) {
      console.log('ℹ️  Schema already exists — skipping duplicate objects.');
    } else {
      console.error('❌ Migration error:', err.message);
      process.exit(1);
    }
  } finally {
    await pool.end();
    console.log('🏁 Migration complete.\n');
  }
}

migrate();
