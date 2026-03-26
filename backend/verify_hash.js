const bcrypt = require('bcrypt');
const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyDAeVJCvM0Mbi';
bcrypt.compare('Admin@1234', hash).then(res => console.log('Match:', res));
