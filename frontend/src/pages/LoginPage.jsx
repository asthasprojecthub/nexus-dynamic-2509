import React, { useState } from 'react';
import { LockKeyhole, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStore } from '../store';
import logoFull from '../assets/nexus-logo-full.png';

export default function LoginPage(){
  const navigate=useNavigate();
  const { refresh }=useStore();
  const [email,setEmail]=useState('admin@nexus.local');
  const [password,setPassword]=useState('Admin@123');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const submit=async(event)=>{
    event.preventDefault();
    setError('');
    setLoading(true);
    try{
      const result=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      localStorage.setItem('nexus_token',result.token);
      localStorage.setItem('nexus_user',JSON.stringify(result.user||{}));
      await refresh();
      navigate('/inquiries',{replace:true});
    }catch(err){setError(err.message||'Login failed');}
    finally{setLoading(false);}
  };

  return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="mb-7 flex justify-center"><img src={logoFull} alt="Nexus" className="h-12 max-w-[210px] object-contain"/></div>
      <div className="mb-5"><h1 className="text-2xl font-bold text-slate-900">Nexus Management</h1><p className="mt-1 text-sm text-slate-500">Sign in with a user created in User Management.</p></div>
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Email</span><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"><Mail size={16} className="text-slate-400"/><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full bg-transparent py-2.5 text-sm outline-none"/></div></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Password</span><div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"><LockKeyhole size={16} className="text-slate-400"/><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required className="w-full bg-transparent py-2.5 text-sm outline-none"/></div></label>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">{loading?'Signing in…':'Sign In'}</button>
      </form>
      <p className="mt-5 text-xs text-slate-400">Seed admin: admin@nexus.local / Admin@123. Change it after setup.</p>
    </div>
  </div>;
}
