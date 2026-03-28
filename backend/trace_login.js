const axios = require('axios');

async function debugLogin() {
  const baseURL = 'http://localhost:3001/api';
  const credentials = {
    email: 'admin@company.com',
    password: 'Admin@1234'
  };

  console.log('--- LOGIN_TRACE ---');
  const start = Date.now();
  
  try {
    console.log(`[${Date.now() - start}ms] Initiating POST /login...`);
    const res = await axios.post(`${baseURL}/login`, credentials, { timeout: 20000 });
    console.log(`[${Date.now() - start}ms] Login Success! Status: ${res.status}`);
    
    const token = res.data.token;
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
    
    console.log(`[${Date.now() - start}ms] Initiating GET /admin/users/me/stats...`);
    const statsRes = await axios.get(`${baseURL}/admin/users/me/stats`, authHeaders);
    console.log(`[${Date.now() - start}ms] Stats Success!`);

    console.log(`[${Date.now() - start}ms] Initiating GET /attendance/active...`);
    const activeRes = await axios.get(`${baseURL}/attendance/active`, authHeaders);
    console.log(`[${Date.now() - start}ms] Active Success!`);

    console.log(`[${Date.now() - start}ms] Initiating GET /attendance/history?limit=5...`);
    const historyRes = await axios.get(`${baseURL}/attendance/history?limit=5`, authHeaders);
    console.log(`[${Date.now() - start}ms] History Success!`);

    console.log(`[${Date.now() - start}ms] Initiating GET /announcements...`);
    const annRes = await axios.get(`${baseURL}/announcements`, authHeaders);
    console.log(`[${Date.now() - start}ms] Announcements Success!`);

  } catch (err) {
    console.log(`[${Date.now() - start}ms] ERROR: ${err.message}`);
    if (err.response) {
      console.log(`Status: ${err.response.status}`);
      console.log('Data:', err.response.data);
    }
  }
  console.log('-------------------');
}

debugLogin();
