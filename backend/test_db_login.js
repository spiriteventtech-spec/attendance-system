const { query } = require('./src/config/db');
const bcrypt = require('bcrypt');

async function testLogin() {
  const email = 'admin@company.com';
  const password = 'Admin@1234';
  
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    console.log('User not found!');
    process.exit(1);
  }
  
  const user = rows[0];
  console.log('DB User:', user.email, 'Status:', user.status);
  console.log('DB Hash:', user.password_hash);
  
  const valid = await bcrypt.compare(password, user.password_hash);
  console.log('Bcrypt match:', valid);
  process.exit(0);
}
testLogin();
