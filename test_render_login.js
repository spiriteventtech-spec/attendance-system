const url = 'https://attendance-system-1-jb6q.onrender.com/api/login';
const data = { email: 'admin@company.com', password: 'Admin@1234' };

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
  .then(async r => {
    const text = await r.text();
    console.log('Body:', text);
  })
  .catch(console.error);
