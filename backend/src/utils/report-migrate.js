// src/utils/report-migrate.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  console.log('\n📊 Running Automated Weekly Reporting Migration...\n');

  const filePath = path.join(__dirname, '../../', 'report_migration.sql');

  if (!fs.existsSync(filePath)) {
    console.error('❌ report_migration.sql not found at:', filePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Report settings seed successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🏁 Report migration complete.\n');
  }
}

migrate();
