import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AdminProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [dashStats, setDashStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/passenger/profile'),   // returns the User doc (works for admin role too)
      api.get('/admin/dashboard'),
    ])
      .then(([profRes, dashRes]) => {
        setProfile(profRes.data);
        setDashStats(dashRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const formatDate = (iso) => {
    if (!iso) return '--';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero Header */}
      <div className="bg-[#0F0F10] text-white px-6 py-10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center md:items-end gap-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-red-400 to-rose-700 flex items-center justify-center text-5xl shadow-xl flex-shrink-0">
            🛡️
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1 text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span> System Administrator
            </div>
            <h1 className="text-2xl font-extrabold">{profile?.name || user?.name}</h1>
            <p className="text-stone-400 text-sm">{profile?.email}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/admin-dashboard')} className="bg-red-500 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-red-600 transition">
              Admin Dashboard
            </button>
            <button onClick={handleLogout} className="bg-stone-800 text-stone-300 font-bold text-xs px-4 py-2 rounded-xl hover:bg-stone-700 transition">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Fleet Stats Bar */}
      <div className="bg-white border-b border-stone-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 grid grid-cols-4 divide-x divide-stone-100">
          {[
            { label: 'Total Users', value: dashStats?.totalUsers ?? '--' },
            { label: 'Total Drivers', value: dashStats?.totalDrivers ?? '--' },
            { label: 'Total Rides', value: dashStats?.totalRides ?? '--' },
            { label: 'Platform Revenue', value: dashStats?.totalEarnings != null ? `₹${Number(dashStats.totalEarnings).toLocaleString('en-IN')}` : '--' },
          ].map(s => (
            <div key={s.label} className="px-4 first:pl-0 last:pr-0 text-center">
              <p className="text-xl font-black text-[#1c1917]">
                {loading ? <span className="inline-block w-12 h-5 bg-stone-100 animate-pulse rounded-lg" /> : s.value}
              </p>
              <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-12 grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Personal Info Card */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-400 mb-5">Account Details</h2>
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-5 bg-stone-100 animate-pulse rounded-lg"/>)}</div>
          ) : (
            <div className="space-y-4">
              {[
                { icon: '👤', label: 'Full Name', val: profile?.name },
                { icon: '📧', label: 'Email', val: profile?.email },
                { icon: '📱', label: 'Phone', val: profile?.phone || 'Not set' },
                { icon: '🛡️', label: 'Role', val: 'Platform Administrator' },
                { icon: '📅', label: 'Account Created', val: formatDate(profile?.createdAt) },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="bg-stone-50 border border-stone-100 rounded-lg p-1.5 text-base">{f.icon}</span>
                  <div>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{f.label}</p>
                    <p className="text-sm text-stone-800 font-semibold">{f.val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Platform Health Card */}
        <div className="space-y-4">
          <div className="bg-[#0F0F10] rounded-2xl p-6 text-white">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-stone-400 mb-5">Platform Health</h2>
            <div className="space-y-4">
              {[
                { label: 'Registered Passengers', val: dashStats?.totalUsers ?? '--', icon: '👥', color: 'text-sky-400' },
                { label: 'Registered Drivers', val: dashStats?.totalDrivers ?? '--', icon: '🚕', color: 'text-yellow-400' },
                { label: 'Total Rides Booked', val: dashStats?.totalRides ?? '--', icon: '📍', color: 'text-emerald-400' },
                { label: 'Active Rides Now', val: dashStats?.activeRides ?? '--', icon: '⚡', color: 'text-orange-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-stone-300 text-sm font-medium">{s.label}</span>
                  </div>
                  <span className={`font-extrabold text-lg ${s.color}`}>
                    {loading ? '...' : s.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Card */}
          <div className="bg-gradient-to-br from-[#EAB308] to-[#CA8A04] rounded-2xl p-5 text-black flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-black/60">Total Platform Revenue</p>
              <p className="text-3xl font-black mt-1">
                {loading ? '...' : `₹${Number(dashStats?.totalEarnings ?? 0).toLocaleString('en-IN')}`}
              </p>
              <p className="text-xs text-black/60 mt-1">From all completed rides</p>
            </div>
            <div className="text-5xl">💰</div>
          </div>
        </div>

        {/* Permissions / Access Block */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-400 mb-5">Administrator Permissions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { icon: '👥', label: 'Manage All Users', desc: 'View & control passenger accounts' },
              { icon: '🚕', label: 'Manage Drivers', desc: 'Monitor fleet performance & stats' },
              { icon: '📍', label: 'Live Ride Tracking', desc: 'Real-time dispatch monitoring' },
              { icon: '🗺️', label: 'Location Management', desc: 'Create & manage pickup zones' },
              { icon: '💬', label: 'System Messages', desc: 'Monitor ride chats & alerts' },
              { icon: '📊', label: 'Analytics & Reports', desc: 'Revenue, trips, earnings data' },
            ].map(p => (
              <div key={p.label} className="bg-stone-50 border border-stone-100 rounded-xl p-4">
                <div className="text-2xl mb-2">{p.icon}</div>
                <p className="font-extrabold text-stone-800 text-sm">{p.label}</p>
                <p className="text-xs text-stone-400 mt-0.5">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminProfile;
