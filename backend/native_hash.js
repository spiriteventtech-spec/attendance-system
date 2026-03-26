const { query } = require('./src/config/db');
const bcrypt = require('bcrypt');

async function fix() {
  const password = 'Admin@1234';
  const hash = await bcrypt.hash(password, 12);
  console.log('Generated new Linux-native hash:', hash);
  
  await query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'admin@company.com']);
  console.log('Database updated successfully.');
  
  const valid = await bcrypt.compare(password, hash);
  console.log('Sanity check match:', valid);
  process.exit(0);
}
fix();
