const bcrypt = require('bcrypt');
const hash = '$2b$12$Nc//74jptEGJBU7UNUb1x.xelWUnFpnToLmaS1MadysdHb6b1B56a';
bcrypt.compare('Admin@1234', hash).then(res => console.log('Match NEW:', res));
bcrypt.hash('Admin@1234', 12).then(h => console.log('Fresh Hash:', h));
