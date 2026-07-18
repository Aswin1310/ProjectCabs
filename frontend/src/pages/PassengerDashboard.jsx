import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

const PassengerDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // Tab states: 'daily', 'outstation', 'rentals'
    const [activeTab, setActiveTab] = useState('daily');
    const [bookingPhase, setBookingPhase] = useState('search'); // search, selecting, requesting
    const [pickup, setPickup] = useState('');
    const [destination, setDestination] = useState('');
    const [locations, setLocations] = useState([]);
    const [cabType, setCabType] = useState('Mini');
    const [fareEstimate, setFareEstimate] = useState(0);

    // Rentals Package selector state
    const [rentalPackage, setRentalPackage] = useState('1 Hour (10 km) - ₹250');
    const [showOutstationTooltip, setShowOutstationTooltip] = useState(false);

    const rentalPackages = [
        { id: '1h', label: '1 Hour (10 km) - ₹250', price: 250 },
        { id: '2h', label: '2 Hours (20 km) - ₹480', price: 480 },
        { id: '4h', label: '4 Hours (40 km) - ₹900', price: 900 },
        { id: '8h', label: '8 Hours (80 km) - ₹1700', price: 1700 },
        { id: '12h', label: '12 Hours (120 km) - ₹2500', price: 2500 }
    ];

    useEffect(() => {
        api.get('/locations').then(res => {
            setLocations(res.data);
            if (res.data.length > 0) {
                setPickup(res.data[0].name);
                setDestination(res.data[Math.min(1, res.data.length - 1)].name);
            }
        }).catch(err => console.error("Failed to load locations", err));
    }, []);

    const calculateFare = (e) => {
        e.preventDefault();
        
        let calculatedFare = 0;
        if (activeTab === 'rentals') {
            const selectedPkg = rentalPackages.find(p => p.label === rentalPackage);
            calculatedFare = selectedPkg ? selectedPkg.price : 250;
        } else {
            const mockDistance = Math.floor(Math.random() * 20) + 2; 
            const baseFares = { 
                '4 Seater': 12, '5 Seater': 14, '6 Seater': 18, '7 Seater': 22, 
                'Mini': 10, 'Sedan': 15, 'SUV': 25, 'Auto': 8 
            };
            let rate = baseFares[cabType] || 10;
            // Outstation rides cost 1.5x standard rates
            if (activeTab === 'outstation') rate = Math.round(rate * 1.5);
            calculatedFare = mockDistance * rate;
        }
        
        setFareEstimate(calculatedFare);
        setBookingPhase('selecting');
    };

    const bookRide = async () => {
        setBookingPhase('requesting');
        
        const pickupLoc = locations.find(l => l.name === pickup);
        const destLoc = locations.find(l => l.name === destination);

        const finalDestination = activeTab === 'rentals' ? `Rental: ${rentalPackage}` : destination;
        const finalDestCoords = activeTab === 'rentals' 
            ? (pickupLoc ? pickupLoc.coordinates : [76.9558, 11.0168])
            : (destLoc ? destLoc.coordinates : [76.9658, 11.0268]);

        try {
             const response = await api.post('/rides', {
                 pickup,
                 destination: finalDestination,
                 pickupCoordinates: pickupLoc ? pickupLoc.coordinates : [76.9558, 11.0168],
                 destinationCoordinates: finalDestCoords,
                 distance: activeTab === 'rentals' ? 0 : fareEstimate / 10,
                 duration: activeTab === 'rentals' ? 60 : 15, 
                 fare: fareEstimate,
                 cabType
             });

             // If backend says no driver found, show error instantly — no socket needed
             if (!response.data.driverFound) {
                 alert('No drivers are currently available. Please try again shortly.');
                 setBookingPhase('search');
                 return;
             }

             const rideId = response.data._id;
             const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
             const socket = io('http://localhost:5000', {
                 auth: { token: user?.token || storedUser?.token }
             });

             socket.on('connect', () => {
                 console.log('Passenger socket connected for ride:', rideId);
                 socket.emit('joinRideRoom', { rideId });
             });

             socket.on('rideAccepted', (data) => {
                 clearInterval(pollTimer);
                 socket.close();
                 navigate(`/ride/${data.rideId}`);
             });

             socket.on('noDriversAvailable', (data) => {
                 clearInterval(pollTimer);
                 alert(data.message || 'No Drivers available matching this schedule nearby.');
                 setBookingPhase('search');
                 socket.close();
             });

             // Polling fallback: if socket event is missed, check DB every 3 sec
             const pollTimer = setInterval(async () => {
                 try {
                     const rideRes = await api.get(`/rides/${rideId}`);
                     if (rideRes.data.rideStatus === 'accepted') {
                         clearInterval(pollTimer);
                         socket.close();
                         navigate(`/ride/${rideId}`);
                     } else if (rideRes.data.rideStatus === 'cancelled') {
                         clearInterval(pollTimer);
                         socket.close();
                         alert('Ride was cancelled. Please try again.');
                         setBookingPhase('search');
                     }
                 } catch (_) {}
             }, 3000);

             // Timeout after 90 seconds
             setTimeout(() => {
                 clearInterval(pollTimer);
                 if (socket.connected) socket.close();
                 setBookingPhase('search');
                 alert('No driver accepted the ride in time. Please try again.');
             }, 90000);

        } catch (error) {
             console.error('Booking failed:', error);
             alert('Failed to book ride');
             setBookingPhase('search');
        }
    };

    return (
        <div className="min-h-screen bg-neutral-100">
            <div className="flex flex-col md:flex-row">
                
                {/* Left Panel: Dynamic Tabs & Booking Controls */}
                <div className="w-full md:w-[380px] lg:w-[420px] bg-white min-h-[calc(100vh-4rem)] p-6 shadow-xl z-20 flex flex-col justify-between">
                    
                    <div>
                        {/* Booking category selectors matching the mock */}
                        <div className="flex justify-between items-center border-b border-stone-100 pb-3 mb-6 relative">
                            
                            {/* DAILY RIDES */}
                            <button
                                type="button"
                                onClick={() => { setActiveTab('daily'); setBookingPhase('search'); }}
                                className={`text-[11px] lg:text-xs font-black tracking-wider uppercase transition-all pb-1.5 outline-none
                                    ${activeTab === 'daily' 
                                        ? 'text-black border-b-2 border-black' 
                                        : 'text-stone-400 hover:text-stone-600'
                                    }`}
                            >
                                Daily Rides
                            </button>

                            {/* OUTSTATION */}
                            <div 
                                className="relative"
                                onMouseEnter={() => setShowOutstationTooltip(true)}
                                onMouseLeave={() => setShowOutstationTooltip(false)}
                            >
                                <button
                                    type="button"
                                    onClick={() => { setActiveTab('outstation'); setBookingPhase('search'); }}
                                    className={`text-[11px] lg:text-xs font-black tracking-wider uppercase transition-all pb-1.5 outline-none
                                        ${activeTab === 'outstation' 
                                            ? 'text-black border-b-2 border-black' 
                                            : 'text-stone-400 hover:text-stone-600'
                                        }`}
                                >
                                    Outstation
                                </button>
                                
                                {showOutstationTooltip && (
                                    <div className="absolute z-30 bottom-full mb-2.5 left-1/2 transform -translate-x-1/2 w-48 text-center bg-black text-stone-100 p-2.5 rounded-lg text-[10px] leading-snug shadow-2xl font-bold">
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1.5 w-3 h-3 bg-black rotate-45"></div>
                                        One-way and Round-trip options for inter-city travel
                                    </div>
                                )}
                            </div>

                            {/* RENTALS */}
                            <button
                                type="button"
                                onClick={() => { setActiveTab('rentals'); setBookingPhase('search'); }}
                                className={`text-[11px] lg:text-xs font-black tracking-wider uppercase transition-all px-3 py-1 rounded-full outline-none
                                    ${activeTab === 'rentals' 
                                        ? 'bg-[#CCEC43] text-stone-900 border-none font-black shadow-sm' 
                                        : 'text-stone-450 hover:bg-stone-50'
                                    }`}
                            >
                                Rentals
                            </button>

                        </div>

                        {bookingPhase === 'search' && (
                            <form onSubmit={calculateFare} className="space-y-5">
                                
                                {/* Location Fields */}
                                <div className="space-y-3.5 relative">
                                    <div className="absolute left-4 top-6 w-0.5 h-12 bg-stone-200 pointer-events-none"></div>
                                    
                                    {/* Pickup Select */}
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#EAB308]">📍</span>
                                        <select
                                            className="w-full p-4 pl-10 border border-stone-250 rounded-xl bg-stone-50 font-semibold focus:border-black focus:ring-2 focus:ring-black/5 outline-none appearance-none cursor-pointer"
                                            value={pickup}
                                            onChange={(e) => setPickup(e.target.value)}
                                            required
                                        >
                                            <option value="" disabled>Select Pickup Location</option>
                                            {locations.map(loc => <option key={loc._id} value={loc.name}>{loc.name}</option>)}
                                        </select>
                                    </div>

                                    {/* Destination or Package */}
                                    {activeTab === 'rentals' ? (
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-emerald-500">📦</span>
                                            <select
                                                className="w-full p-4 pl-10 border border-stone-250 rounded-xl bg-stone-50 font-semibold focus:border-black focus:ring-2 focus:ring-black/5 outline-none appearance-none cursor-pointer"
                                                value={rentalPackage}
                                                onChange={(e) => setRentalPackage(e.target.value)}
                                                required
                                            >
                                                {rentalPackages.map(pkg => (
                                                    <option key={pkg.id} value={pkg.label}>{pkg.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-red-500">🏁</span>
                                            <select
                                                className="w-full p-4 pl-10 border border-stone-250 rounded-xl bg-stone-50 font-semibold focus:border-black focus:ring-2 focus:ring-black/5 outline-none appearance-none cursor-pointer"
                                                value={destination}
                                                onChange={(e) => setDestination(e.target.value)}
                                                required
                                            >
                                                <option value="" disabled>Select Destination</option>
                                                {locations.map(loc => <option key={loc._id} value={loc.name}>{loc.name}</option>)}
                                            </select>
                                        </div>
                                    )}

                                </div>

                                {/* Cab Types */}
                                <div>
                                    <h3 className="font-extrabold text-stone-700 text-xs uppercase tracking-wider mb-2.5">Select Cab Class</h3>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {['Mini', 'Sedan', 'SUV', 'Auto', '4 Seater', '5 Seater', '6 Seater', '7 Seater'].map((type) => (
                                            <button 
                                                type="button"
                                                key={type}
                                                onClick={() => setCabType(type)}
                                                className={`p-3 rounded-xl font-bold border text-sm transition-all duration-200
                                                    ${cabType === type 
                                                        ? 'border-[#EAB308] bg-[#EAB308]/10 text-black font-extrabold shadow-sm' 
                                                        : 'border-stone-200 text-stone-500 bg-white hover:bg-stone-50'
                                                    }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    className="w-full bg-black hover:bg-neutral-800 text-white font-extrabold text-base py-4 rounded-xl transition duration-200 shadow-md mt-6"
                                >
                                    Search Cabs
                                </button>
                            </form>
                        )}

                        {bookingPhase === 'selecting' && (
                            <div className="flex flex-col space-y-6">
                                <div className="bg-stone-50 p-6 rounded-2xl border border-stone-150 shadow-sm leading-snug">
                                    <h2 className="text-stone-500 font-bold uppercase tracking-wider text-xs mb-1">Estimated Fare</h2>
                                    <h1 className="text-4xl lg:text-5xl font-black text-black">₹{fareEstimate}</h1>
                                    <p className="text-stone-400 text-xs mt-2.5 font-bold">
                                        For a {cabType} class ({activeTab === 'rentals' ? 'Rental Package' : activeTab === 'outstation' ? 'Outstation Intercity' : 'Daily Commute'})
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <button 
                                        onClick={bookRide} 
                                        className="w-full bg-[#EAB308] text-black font-extrabold text-base py-4 rounded-xl shadow-[0_4px_12px_rgba(234,179,8,0.2)] hover:bg-[#CA8A04] transition-all"
                                    >
                                        Confirm Booking
                                    </button>
                                    <button 
                                        onClick={() => setBookingPhase('search')} 
                                        className="w-full bg-stone-105 border border-stone-200 text-stone-700 font-bold text-base py-4 rounded-xl hover:bg-stone-150 transition"
                                    >
                                        Edit Details
                                    </button>
                                </div>
                            </div>
                        )}

                        {bookingPhase === 'requesting' && (
                            <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
                                <div className="w-16 h-16 border-4 border-stone-100 border-t-[#EAB308] rounded-full animate-spin mb-6"></div>
                                <h2 className="text-2xl font-black mb-1.5 text-stone-900">Finding your driver</h2>
                                <p className="text-stone-500 text-sm">Contacting nearby available {cabType} drivers in Coimbatore...</p>
                            </div>
                        )}

                    </div>

                    {/* Footer instructions block matching the location prompt instructions in user style */}
                    <div className="border-t border-stone-150 pt-5 mt-6 leading-normal text-stone-600 bg-stone-50/50 p-4 rounded-xl border border-stone-100">
                        <div className="flex items-start gap-3">
                            <div className="bg-stone-200 p-2 rounded-full flex items-center justify-center text-stone-505 w-9 h-9 flex-shrink-0">
                                <svg className="w-5 h-5 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <div className="text-xs text-stone-600">
                                <h4 className="font-bold text-[#1c1917] mb-1">For an accurate pickup - please allow location access</h4>
                                <ol className="list-decimal list-inside space-y-1 text-stone-500 pl-0.5">
                                    <li>Turn on your device location.</li>
                                    <li>Give 'GoCab' access to your browser's location.</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Panel: Coimbatore Fallback Grid Map */}
                <div className="hidden md:block w-full md:flex-grow bg-stone-200 relative overflow-hidden h-[calc(100vh-4rem)]">
                    <img 
                        src="https://upload.wikimedia.org/wikipedia/commons/e/ea/Coimbatore_city_map.png"
                        alt="Coimbatore Map Network"
                        className="w-full h-full object-cover opacity-45 grayscale sepia-[.15]"
                        onError={(e) => e.target.src="https://images.unsplash.com/photo-1524661135-423995f22d0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"}
                    />
                    
                    {/* Simulated cabs marker list */}
                    {[...Array(20)].map((_, i) => (
                        <div 
                            key={i} 
                            className="absolute bg-white rounded-full p-1.5 shadow-lg flex items-center justify-center pointer-events-none hover:scale-110 transition-transform duration-200"
                            style={{ 
                                top: `${15 + Math.random() * 70}%`, 
                                left: `${15 + Math.random() * 70}%`, 
                                transform: 'translate(-50%, -50%)',
                                opacity: 0.85
                            }}
                        >
                            <span className="text-base select-none">🚕</span>
                        </div>
                    ))}

                    <div className="absolute top-8 right-8 bg-white/90 backdrop-blur-md p-3 px-4 rounded-xl shadow-lg border border-white/40 flex items-center gap-3">
                         <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse shadow-[0_0_8px_#eab308]"></div>
                         <span className="font-extrabold text-stone-750 text-xs uppercase tracking-wider">Coimbatore Fleet Active</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default PassengerDashboard;
