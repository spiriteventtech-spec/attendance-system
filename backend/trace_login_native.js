const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const payload = JSON.stringify({
  email: 'admin@company.com',
  password: 'Admin@1234'
});

console.log('--- LOGIN_TRACE_NATIVE ---');
const start = Date.now();

const req = http.request(options, (res) => {
  console.log(`[${Date.now() - start}ms] Headers received. Status: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(`[${Date.now() - start}ms] Body received.`);
    try {
      const parsed = JSON.parse(data);
      console.log('Token exists:', !!parsed.token);
    } catch(e) { console.log('Parse error:', e.message); }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.log(`[${Date.now() - start}ms] Request Error: ${e.message}`);
  process.exit(1);
});

req.write(payload);
req.end();

// Kill after 20s
setTimeout(() => {
  console.log(`[${Date.now() - start}ms] HARD_TIMEOUT`);
  process.exit(1);
}, 20000);
