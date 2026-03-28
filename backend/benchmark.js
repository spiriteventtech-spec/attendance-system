require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('./src/config/db');

async function test() {
  console.log('--- SYSTEM_DIAGNOSTICS ---');
  
  const t1 = Date.now();
  await query('SELECT 1');
  console.log(`- DB Lateny (SELECT 1): ${Date.now() - t1}ms`);
  
  const hash = '$2b$12$XBcoXhzykpde9SjVC6VlfuVhlC67ZGy4UM6XxXGrpwTlkETTbLFQVu';
  const pass = 'Admin@1234';
  
  const t2 = Date.now();
  const valid = await bcrypt.compare(pass, hash);
  console.log(`- Bcrypt Compare: ${Date.now() - t2}ms (Valid: ${valid})`);
  
  const t3 = Date.now();
  const { rows } = await query('SELECT count(*) FROM users');
  console.log(`- DB Complex Query (user count): ${Date.now() - t3}ms (Count: ${rows[0].count})`);
  
  console.log('--------------------------');
  process.exit(0);
}

test().catch(err => {
  console.error('TEST_FAILED:', err);
  process.exit(1);
});
