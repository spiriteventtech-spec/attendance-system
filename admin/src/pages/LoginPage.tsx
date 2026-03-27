// src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Spinner } from '../components/ui';
import toast from 'react-hot-toast';
import Logo from '../assets/logo-premium.png';

export default function LoginPage() {
  const { login } = useAuthStore();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 mb-6 bg-white rounded-3xl shadow-premium border border-black/[0.03]">
            <img src={Logo} className="w-12 h-12 object-contain" alt="EventsTrack Logo" />
          </div>
          <h1 className="text-3xl font-bold text-[#1D1D1F] tracking-tight">EventsTrack</h1>
          <p className="text-base text-[#86868B] font-medium mt-1">Management & Workforce Portal</p>
        </div>

        {/* Form */}
        <div className="premium-card !p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Corporate Email</label>
              <input
                type="email"
                className="input-apple"
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#86868B] uppercase tracking-widest block mb-2">Security Passphrase</label>
              <input
                type="password"
                className="input-apple"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-apple w-full py-3.5 mt-4 text-base" disabled={loading}>
              {loading ? <Spinner size="sm" /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#86868B] mt-10 font-medium">
          Authorized personnel only. Secure access session.
        </p>
      </div>
    </div>
  );
}
