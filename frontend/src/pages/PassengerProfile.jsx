import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const statusColors = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  started:   'bg-blue-100 text-blue-700 border-blue-200',
  accepted:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  pending:   'bg-stone-100 text-stone-600 border-stone-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
};

const PassengerProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [rides, setRides] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingRides, setLoadingRides] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedRide, setSelectedRide] = useState(null);
  
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const RIDES_PER_PAGE = 10;

  useEffect(() => {
    api.get('/passenger/profile')
      .then(r => setProfile(r.data))
      .catch(console.error)
      .finally(() => setLoadingProfile(false));

    api.get('/passenger/rides')
      .then(r => setRides(r.data))
      .catch(console.error)
      .finally(() => setLoadingRides(false));
  }, []);

  const totalSpent = rides.filter(r => r.rideStatus === 'completed').reduce((s, r) => s + r.fare, 0);
  const completedRides = rides.filter(r => r.rideStatus === 'completed').length;
  const cancelledRides = rides.filter(r => r.rideStatus === 'cancelled').length;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const formatDate = (iso) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero Header */}
      <div className="bg-[#0F0F10] text-white px-6 py-10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center md:items-end gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-4xl font-black text-black shadow-xl flex-shrink-0">
            {(profile?.name || user?.name || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1 text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span> Rider
            </div>
            <h1 className="text-2xl font-extrabold">{profile?.name || user?.name}</h1>
            <p className="text-stone-400 text-sm">{profile?.email}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/passenger-dashboard')} className="bg-[#EAB308] text-black font-bold text-xs px-4 py-2 rounded-xl hover:bg-[#CA8A04] transition">
              Book a Ride
            </button>
            <button onClick={handleLogout} className="bg-stone-800 text-stone-300 font-bold text-xs px-4 py-2 rounded-xl hover:bg-stone-700 transition">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b border-stone-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-y-4 sm:gap-y-0 divide-y sm:divide-y-0 sm:divide-x divide-stone-100">
          {[
            { label: 'Total Rides', value: rides.length },
            { label: 'Completed', value: completedRides },
            { label: 'Total Spent', value: `₹${totalSpent.toLocaleString('en-IN')}` },
          ].map((s) => (
            <div key={s.label} className="px-6 py-2 sm:py-0 first:pl-0 sm:first:pt-0 last:pr-0 sm:last:pb-0 text-center">
              <p className="text-2xl font-black text-[#1c1917]">{s.value}</p>
              <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="flex border-b border-stone-150 mb-6">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'rides', label: `Ride History (${rides.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setSelectedRide(null); }}
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
              {loadingProfile ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-5 bg-stone-100 animate-pulse rounded-lg" />)}</div>
              ) : (
                <div className="space-y-4">
                  {[
                    { icon: '👤', label: 'Full Name', val: profile?.name },
                    { icon: '📧', label: 'Email', val: profile?.email },
                    { icon: '📱', label: 'Phone', val: profile?.phone || 'Not set' },
                    { icon: '🎫', label: 'Role', val: 'Passenger / Rider' },
                    { icon: '📅', label: 'Member Since', val: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '--' },
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

            {/* Quick Stats */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-400 mb-4">Ride Summary</h2>
                <div className="space-y-3">
                  {[
                    { label: 'Completed Rides', val: completedRides, color: 'text-emerald-600' },
                    { label: 'Cancelled Rides', val: cancelledRides, color: 'text-red-500' },
                    { label: 'Pending / Active', val: rides.filter(r => ['pending','accepted','started'].includes(r.rideStatus)).length, color: 'text-blue-600' },
                    { label: 'Total Fare Paid', val: `₹${totalSpent.toLocaleString('en-IN')}`, color: 'text-[#EAB308]' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                      <span className="text-sm text-stone-500 font-medium">{s.label}</span>
                      <span className={`text-sm font-extrabold ${s.color}`}>{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {rides.length > 0 && (
                <div className="bg-[#0F0F10] rounded-2xl p-5 text-white">
                  <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mb-1">Last Ride</p>
                  <p className="font-bold">{rides[0].pickup} → {rides[0].destination}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusColors[rides[0].rideStatus]}`}>{rides[0].rideStatus}</span>
                    <span className="text-[#EAB308] font-extrabold">₹{rides[0].fare}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RIDE HISTORY TAB */}
        {activeTab === 'rides' && (
          <div className="pb-10">
            {selectedRide ? (
              /* Ride Detail View */
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 max-w-lg">
                <button onClick={() => setSelectedRide(null)} className="flex items-center gap-1.5 text-stone-500 text-sm font-bold hover:text-stone-800 mb-5 outline-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                  Back to History
                </button>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Ride ID</p>
                    <p className="text-xs text-stone-700 font-mono">{selectedRide._id}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusColors[selectedRide.rideStatus]}`}>{selectedRide.rideStatus.toUpperCase()}</span>
                </div>

                {/* Route */}
                <div className="bg-stone-50 rounded-xl p-4 mb-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-yellow-500 text-lg">📍</span>
                    <div>
                      <p className="text-[10px] text-stone-400 font-bold uppercase">Pickup</p>
                      <p className="font-bold text-stone-800 text-sm">{selectedRide.pickup}</p>
                    </div>
                  </div>
                  <div className="h-px bg-stone-200 ml-8"></div>
                  <div className="flex items-center gap-3">
                    <span className="text-red-500 text-lg">🏁</span>
                    <div>
                      <p className="text-[10px] text-stone-400 font-bold uppercase">Destination</p>
                      <p className="font-bold text-stone-800 text-sm">{selectedRide.destination}</p>
                    </div>
                  </div>
                </div>

                {/* Fare & Details Grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { label: 'Fare', val: `₹${selectedRide.fare}`, highlight: true },
                    { label: 'Cab Type', val: selectedRide.cabType },
                    { label: 'Distance', val: `${selectedRide.distance?.toFixed(1)} km` },
                    { label: 'Duration', val: `${selectedRide.duration} min` },
                    { label: 'Payment', val: selectedRide.paymentStatus },
                    { label: 'Date', val: formatDate(selectedRide.createdAt) },
                  ].map(f => (
                    <div key={f.label} className={`rounded-xl p-3 ${f.highlight ? 'bg-[#EAB308]/10 border border-[#EAB308]/30' : 'bg-stone-50 border border-stone-100'}`}>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{f.label}</p>
                      <p className={`font-extrabold text-sm mt-0.5 ${f.highlight ? 'text-[#CA8A04]' : 'text-stone-800'}`}>{f.val}</p>
                    </div>
                  ))}
                </div>

                {/* Driver Info */}
                {selectedRide.driverId && (
                  <div className="bg-[#0F0F10] rounded-xl p-4 text-white flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500 flex items-center justify-center font-black text-black text-lg flex-shrink-0">
                      {(selectedRide.driverId?.userId?.name || 'D')[0]}
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Your Driver</p>
                      <p className="font-bold text-sm">{selectedRide.driverId?.userId?.name || 'Driver'}</p>
                      <p className="text-stone-400 text-xs">{selectedRide.driverId?.vehicleType} · {selectedRide.driverId?.vehicleNumber}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Ride List */
              loadingRides ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-stone-100 animate-pulse rounded-2xl" />)}</div>
              ) : rides.length === 0 ? (
                <div className="text-center py-16 text-stone-400">
                  <div className="text-6xl mb-4">🚕</div>
                  <p className="font-bold text-lg">No rides yet</p>
                  <p className="text-sm mt-1">Book your first GoCab ride now!</p>
                  <button onClick={() => navigate('/passenger-dashboard')} className="mt-5 bg-[#EAB308] text-black font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-[#CA8A04] transition">
                    Book a Ride
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Date Picker Filter */}
                  <div className="bg-[#0F0F10] rounded-2xl p-5 text-white flex flex-col sm:flex-row items-center gap-4 justify-between">
                    <div>
                      <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-400 mb-1">Filter by Date</h2>
                      <p className="text-stone-500 text-xs">Select a date to view your trips</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <input
                            type="date"
                            value={selectedHistoryDate}
                            onChange={e => { setSelectedHistoryDate(e.target.value); setCurrentPage(1); }}
                            className="p-3 w-full rounded-xl bg-stone-800 border border-stone-700 font-bold text-white outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                        />
                        {selectedHistoryDate && (
                            <button onClick={() => { setSelectedHistoryDate(''); setCurrentPage(1); }} className="px-4 py-3 bg-stone-800 text-white rounded-xl hover:bg-stone-700 font-bold text-sm">Clear</button>
                        )}
                    </div>
                  </div>

                  {(() => {
                    const filtered = selectedHistoryDate 
                        ? rides.filter(r => r.createdAt?.substring(0, 10) === selectedHistoryDate)
                        : rides;
                    
                    const totalPages = Math.ceil(filtered.length / RIDES_PER_PAGE);
                    const paginatedList = filtered.slice((currentPage - 1) * RIDES_PER_PAGE, currentPage * RIDES_PER_PAGE);

                    return (
                        <>
                            <div className="text-sm font-bold text-stone-500 mb-2">{filtered.length} ride(s) found</div>
                            {/* Ride Table formatted like Admin Ride Hub */}
                            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden mt-4">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-stone-100">
                                        <thead className="bg-stone-50">
                                            <tr>
                                                {['Ride ID', 'Route', 'Cab Info', 'Date', 'Fare', 'Status', 'View'].map(h => (
                                                    <th key={h} className="px-5 py-3 text-left text-xs font-bold text-stone-500 uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-stone-100">
                                            {paginatedList.map(ride => (
                                                <tr key={ride._id} className="hover:bg-stone-50 transition cursor-pointer" onClick={() => setSelectedRide(ride)}>
                                                    <td className="px-5 py-4 whitespace-nowrap text-sm font-bold text-stone-900 font-mono">
                                                        {ride._id.toString().slice(-8).toUpperCase()}
                                                    </td>
                                                    <td className="px-5 py-4 text-sm max-w-[180px]">
                                                        <div className="font-bold text-stone-800 truncate">{ride.pickup}</div>
                                                        <div className="text-xs text-stone-400 mt-1 truncate">to {ride.destination}</div>
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap text-sm">
                                                        <span className="font-bold text-stone-700">{ride.cabType}</span>
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap text-sm text-stone-500 font-medium">
                                                        {formatDate(ride.createdAt)}
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap text-sm font-extrabold text-[#CA8A04]">
                                                        ₹{ride.fare}
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap">
                                                        <span className={`text-[10px] inline-flex font-bold px-2.5 py-1 rounded-full border ${statusColors[ride.rideStatus]}`}>{ride.rideStatus.toUpperCase()}</span>
                                                    </td>
                                                    <td className="px-5 py-4 whitespace-nowrap text-right">
                                                        <button 
                                                            className="text-[#EAB308] font-bold text-xs bg-yellow-50 px-3 py-1.5 rounded-lg border border-yellow-200 hover:bg-yellow-100 transition"
                                                            onClick={(e) => { e.stopPropagation(); setSelectedRide(ride); }}
                                                        >
                                                            Details →
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-stone-100 shadow-sm mt-4">
                                    <button 
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => p - 1)}
                                        className="px-4 py-2 font-bold text-sm bg-stone-100 rounded-xl hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        ← Prev
                                    </button>
                                    <span className="font-bold text-stone-500 text-sm">Page {currentPage} of {totalPages}</span>
                                    <button 
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => p + 1)}
                                        className="px-4 py-2 font-bold text-sm bg-stone-100 rounded-xl hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next →
                                    </button>
                                </div>
                            )}
                        </>
                    )
                  })()}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PassengerProfile;
