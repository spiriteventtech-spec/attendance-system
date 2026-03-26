const http = require('http');

async function test() {
  // 1. Login
  const loginData = JSON.stringify({ email: 'admin@company.com', password: 'Admin@1234' });
  const token = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body).token));
    });
    req.write(loginData);
    req.end();
  });

  // 2. Create User
  const userData = JSON.stringify({
    firstName: 'Test', lastName: 'User', email: 'test@company.com',
    password: 'password', role: 'staff', phone: ''
  });
  
  const req2 = http.request({
    hostname: 'localhost', port: 3001, path: '/api/admin/users', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': userData.length, 'Authorization': `Bearer ${token}` }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Response:', body));
  });
  req2.write(userData);
  req2.end();
}
test();
