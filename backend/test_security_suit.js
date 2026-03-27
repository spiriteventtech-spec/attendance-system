// test_security_suit.js
// ─────────────────────────────────────────────────────────────────────────────
// Zero-Trust Security Verification Script
// This script simulates various attack vectors (replay, spoofing, conflict)
// to verify the backend security middleware.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const API_URL = 'http://localhost:3001/api';
const STAFF_EMAIL = 'staff@example.com'; // Change to a valid staff email for testing
const STAFF_PASS  = 'password123';

const runTest = async () => {
  console.log('🛡️ Starting Zero-Trust Security Verification Suit...\n');

  try {
    // 1. Initial Login (Device A)
    console.log('Step 1: Logging in with Device_A...');
    const loginRes = await axios.post(`${API_URL}/login`, 
      { email: STAFF_EMAIL, password: STAFF_PASS },
      { headers: { 'X-Device-ID': 'DEVICE_FINGERPRINT_ALPHA_001' } }
    );
    const token = loginRes.data.token;
    const userId = loginRes.data.user.id;
    console.log('✅ Login Success. Token acquired.');

    // 2. Mock Replay Attack (Duplicate Nonce)
    console.log('\nStep 2: Testing Replay Protection...');
    const ts = Date.now().toString();
    const nonce = crypto.createHmac('sha256', process.env.JWT_SECRET || 'geofence_attendance_system_secret_2024')
      .update(`${userId}:${ts}`)
      .digest('hex');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'X-Device-ID': 'DEVICE_FINGERPRINT_ALPHA_001',
      'X-Nonce': nonce,
      'X-Timestamp': ts
    };

    console.log('-> Sending first request (should pass)...');
    try {
      await axios.post(`${API_URL}/attendance/checkin`, {
        siteId: '00000000-0000-0000-0000-000000000000', // Dummy UUID
        latitude: 25.1234, longitude: 51.1234, note: 'Test'
      }, { headers });
    } catch (e) {
      console.log('   (Note: Expected 404/400 site error, but nonce should be consumed)');
    }

    console.log('-> Replaying same nonce (must fail)...');
    try {
      await axios.post(`${API_URL}/attendance/checkin`, {
        siteId: '00000000-0000-0000-0000-000000000000',
        latitude: 25.1234, longitude: 51.1234, note: 'Test'
      }, { headers });
      console.log('❌ FAIL: Replay attack was NOT blocked!');
    } catch (e) {
      if (e.response?.status === 409) {
        console.log('✅ PASS: Replay attack blocked with 409 NONCE_REPLAYED');
      } else {
        console.log('⚠️ Unexpected error:', e.response?.data || e.message);
      }
    }

    // 3. Mock Location Spoofing
    console.log('\nStep 3: Testing Mock Location Detection...');
    try {
      await axios.post(`${API_URL}/location/ping`, {
        latitude: 25.0, longitude: 51.0, accuracy: 5, isMockLocation: true
      }, { headers: { ...headers, 'X-Nonce': 'refresh_needed', 'X-Timestamp': Date.now() } });
      console.log('❌ FAIL: Mock location was NOT blocked!');
    } catch (e) {
      if (e.response?.status === 403 && e.response?.data?.code === 'GPS_SPOOFING') {
        console.log('✅ PASS: Mock location blocked with 403 GPS_SPOOFING');
      } else {
        console.log('⚠️ Unexpected error:', e.response?.data || e.message);
      }
    }

    // 4. Session Conflict (Device B)
    console.log('\nStep 4: Testing Session Conflict (Device B)...');
    try {
      await axios.post(`${API_URL}/login`, 
        { email: STAFF_EMAIL, password: STAFF_PASS },
        { headers: { 'X-Device-ID': 'HAXOR_DEVICE_999' } }
      );
      console.log('ℹ️ Second device login attempt processed.');
      console.log('Check the Security Audit Log in the Admin Panel to see the result!');
    } catch (e) {
      if (e.response?.status === 403) {
        console.log('✅ PASS: Second device blocked (Policy: block_new active)');
      } else {
        console.log('⚠️ Login attempt result:', e.response?.data?.error || 'Possible success (check policy)');
      }
    }

    console.log('\n✨ Security suit complete. Check the Admin Security Audit page for event logs.');

  } catch (err) {
    console.error('\n❌ Suite Error:', err.response?.data || err.message);
    console.log('\nMake sure the backend is running and STAFF_EMAIL matches a user with an existing device_fingerprint.');
  }
};

runTest();
