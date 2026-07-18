import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const DriverProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [driverData, setDriverData] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentRides, setRecentRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const driverRes = await api.get('/driver/me');
        setDriverData(driverRes.data);
        setProfile(driverRes.data.userId); // set profile from populated userId

        // Fetch stats via admin-stats endpoint using the driverId
        const statsRes = await api.get(`/admin/drivers/${driverRes.data._id}/stats`);
        setStats(statsRes.data.stats);
        setRecentRides(statsRes.data.recentRides || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const formatDate = (iso) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const statusColors = {
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    started:   'bg-blue-100 text-blue-700 border-blue-200',
    accepted:  'bg-yellow-100 text-yellow-700 border-yellow-200',
    pending:   'bg-stone-100 text-stone-600 border-stone-200',
    cancelled: 'bg-red-100 text-red-600 border-red-200',
  };

  const rating = driverData?.rating ?? 5.0;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero Header */}
      <div className="bg-[#0F0F10] text-white px-6 py-10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center md:items-end gap-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-700 flex items-center justify-center text-4xl font-black text-black shadow-xl flex-shrink-0">
            {(profile?.name || user?.name || 'D')[0].toUpperCase()}
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1 text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
              {driverData?.isOnline ? 'Online' : 'Offline'} · Driver
            </div>
            <h1 className="text-2xl font-extrabold">{profile?.name || user?.name}</h1>
            <p className="text-stone-400 text-sm">{profile?.email}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/driver-dashboard')} className="bg-[#EAB308] text-black font-bold text-xs px-4 py-2 rounded-xl hover:bg-[#CA8A04] transition">
              Go to Dashboard
            </button>
            <button onClick={handleLogout} className="bg-stone-800 text-stone-300 font-bold text-xs px-4 py-2 rounded-xl hover:bg-stone-700 transition">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b border-stone-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-y-6 md:gap-y-0 divide-x-0 md:divide-x divide-stone-100">
          {[
            { label: 'Total Trips', value: stats?.allTime?.trips ?? driverData?.totalTrips ?? 0 },
            { label: 'Total Earned', value: `₹${(stats?.allTime?.earnings ?? driverData?.earnings ?? 0).toLocaleString('en-IN')}` },
            { label: 'Rating', value: `${rating} ⭐` },
            { label: 'This Month', value: `₹${(stats?.month?.earnings ?? 0).toLocaleString('en-IN')}` },
          ].map((s) => (
            <div key={s.label} className="px-4 first:pl-0 last:pr-0 text-center">
              <p className="text-xl font-black text-[#1c1917]">{s.value}</p>
              <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="flex border-b border-stone-150 mb-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'vehicle', label: 'Vehicle & License' },
            { id: 'rides', label: `Recent Rides (${recentRides.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-3 mr-6 text-sm font-bold transition outline-none border-b-2
                ${activeTab === t.id ? 'border-[#EAB308] text-[#1c1917]' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-10">
            {/* Personal Info */}
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-400 mb-5">Personal Details</h2>
              {loading ? (
                <div className="space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-5 bg-stone-100 animate-pulse rounded-lg"/>)}</div>
              ) : (
                <div className="space-y-4">
                  {[
                    { icon: '👤', label: 'Full Name', val: profile?.name },
                    { icon: '📧', label: 'Email', val: profile?.email },
                    { icon: '📱', label: 'Phone', val: profile?.phone || '--' },
                    { icon: '📅', label: 'Member Since', val: formatDate(profile?.createdAt) },
                    { icon: '🌐', label: 'Status', val: driverData?.isOnline ? '🟢 Online (Available)' : '🔴 Offline' },
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

            {/* Earnings Panel */}
            <div className="space-y-4">
              {/* Today & Month Earnings */}
              <div className="bg-[#0F0F10] rounded-2xl p-5 text-white">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-stone-400 mb-4">Earnings Breakdown</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Today's Trips", val: stats?.today?.trips ?? 0, sub: `₹${(stats?.today?.earnings ?? 0).toLocaleString('en-IN')}` },
                    { label: "This Month", val: `${stats?.month?.trips ?? 0} trips`, sub: `₹${(stats?.month?.earnings ?? 0).toLocaleString('en-IN')}` },
                    { label: "All Time Trips", val: stats?.allTime?.trips ?? driverData?.totalTrips ?? 0, sub: 'Total rides' },
                    { label: "All Time Earned", val: `₹${(stats?.allTime?.earnings ?? driverData?.earnings ?? 0).toLocaleString('en-IN')}`, sub: 'Total earnings' },
                  ].map(s => (
                    <div key={s.label} className="bg-stone-900/50 border border-white/5 rounded-xl p-3">
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{s.label}</p>
                      <p className="text-[#EAB308] font-extrabold text-base mt-0.5">{s.val}</p>
                      <p className="text-stone-500 text-xs">{s.sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rating Card */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-yellow-50 border border-yellow-200 flex items-center justify-center text-3xl font-black text-yellow-600">
                  {rating.toFixed(1)}
                </div>
                <div>
                  <p className="font-extrabold text-stone-800">Driver Rating</p>
                  <div className="flex gap-0.5 mt-1">
                    {[1,2,3,4,5].map(i => (
                      <span key={i} className={`text-lg ${i <= Math.round(rating) ? 'text-yellow-400' : 'text-stone-200'}`}>★</span>
                    ))}
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Based on passenger feedback</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VEHICLE TAB */}
        {activeTab === 'vehicle' && (
          <div className="pb-10 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-400 mb-5">Vehicle Information</h2>
              {loading ? (
                <div className="space-y-3">{[...Array(4)].map((_,i)=><div key={i} className="h-5 bg-stone-100 animate-pulse rounded-lg"/>)}</div>
              ) : (
                <div className="space-y-4">
                  {[
                    { icon: '🚕', label: 'Vehicle Class', val: driverData?.vehicleType },
                    { icon: '🔢', label: 'Registration Number', val: driverData?.vehicleNumber },
                    { icon: '📋', label: 'License Number', val: driverData?.licenseNumber },
                    { icon: '📍', label: 'Last Known Location', val: driverData?.currentLocation?.coordinates ? `${driverData.currentLocation.coordinates[1].toFixed(4)}°N, ${driverData.currentLocation.coordinates[0].toFixed(4)}°E` : 'Not updated' },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-3">
                      <span className="bg-stone-50 border border-stone-100 rounded-lg p-1.5 text-base">{f.icon}</span>
                      <div>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{f.label}</p>
                        <p className="text-sm text-stone-800 font-semibold">{f.val || '--'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0F0F10] rounded-2xl p-6 text-white flex flex-col justify-between">
              <div>
                <div className="text-5xl mb-3">🚗</div>
                <h3 className="font-extrabold text-white text-lg">{driverData?.vehicleType} Class</h3>
                <p className="text-stone-400 text-sm mt-1">{driverData?.vehicleNumber}</p>
              </div>
              <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Total Trips</p>
                  <p className="text-[#EAB308] font-extrabold text-xl">{stats?.allTime?.trips ?? driverData?.totalTrips ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Avg Earnings/Trip</p>
                  <p className="text-[#EAB308] font-extrabold text-xl">
                    ₹{stats?.allTime?.trips > 0 ? Math.round((stats?.allTime?.earnings ?? 0) / stats.allTime.trips) : 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RIDES TAB */}
        {activeTab === 'rides' && (
          <div className="pb-10 space-y-3">
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-20 bg-stone-100 animate-pulse rounded-2xl"/>)}</div>
            ) : recentRides.length === 0 ? (
              <div className="text-center py-16 text-stone-400">
                <div className="text-6xl mb-4">🚕</div>
                <p className="font-bold text-lg">No rides completed yet</p>
                <p className="text-sm mt-1">Go online from your dashboard to start accepting rides.</p>
              </div>
            ) : recentRides.map((ride, i) => (
              <div key={ride._id || i} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-lg flex-shrink-0">✅</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-stone-800 text-sm truncate">{ride.pickup} → {ride.destination}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{ride.cabType} · {formatDate(ride.createdAt)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-extrabold text-emerald-600">+₹{ride.fare}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[ride.rideStatus]}`}>{ride.rideStatus}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverProfile;
