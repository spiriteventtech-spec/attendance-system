const http = require('http');

async function test() {
  // 1. Login to get token
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

  console.log('Login successful, token retrieved.');

  // 2. Create Site
  const siteData = JSON.stringify({
    name: 'Test Site',
    description: 'A test site description',
    latitude: 25.2854,
    longitude: 51.5310,
    radiusMeters: 100
  });
  
  const req2 = http.request({
    hostname: 'localhost', port: 3001, path: '/api/admin/users/sites', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': siteData.length, 'Authorization': `Bearer ${token}` }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Response Status:', res.statusCode, '\nResponse Body:', body));
  });
  req2.write(siteData);
  req2.end();
}
test().catch(err => console.error('Test failed:', err));
