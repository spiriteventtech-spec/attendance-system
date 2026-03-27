// src/utils/security-migrate.js
// Run with: node src/utils/security-migrate.js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  console.log('\n🛡️  Running Zero-Trust Security Migration...\n');

  const filePath = path.join(__dirname, '../../', 'security_migration.sql');

  if (!fs.existsSync(filePath)) {
    console.error('❌ security_migration.sql not found at:', filePath);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Security schema applied successfully.');
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('already a column')) {
      console.log('ℹ️  Security schema already partially or fully exists — skipping duplicate objects.');
    } else {
      console.error('❌ Migration error:', err.message);
      process.exit(1);
    }
  } finally {
    await pool.end();
    console.log('🏁 Security migration complete.\n');
  }
}

migrate();
