// src/utils/shifts-migrate.js
// Run with: node src/utils/shifts-migrate.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  console.log('\n📅  Running Shift Scheduling Migration...\n');

  const filePath = path.join(__dirname, '../../', 'migration_shifts.sql');

  if (!fs.existsSync(filePath)) {
    console.error('❌ migration_shifts.sql not found at:', filePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Shift schema applied successfully.');
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('already a column')) {
      console.log('ℹ️  Shift schema already partially or fully exists — skipping duplicate objects.');
    } else {
      console.error('❌ Migration error:', err.message);
      process.exit(1);
    }
  } finally {
    await pool.end();
    console.log('🏁 Shift migration complete.\n');
  }
}

migrate();
