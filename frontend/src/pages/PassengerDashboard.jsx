import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import LeafletMap from '../components/LeafletMap';

const PassengerDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // Tab states: 'daily', 'outstation', 'rentals'
    const [activeTab, setActiveTab] = useState('daily');
    const [bookingPhase, setBookingPhase] = useState('search'); // search, selecting, requesting
    const [pickup, setPickup] = useState('');
    const [destination, setDestination] = useState('');
    const [pickupPos, setPickupPos] = useState(null);
    const [destPos, setDestPos] = useState(null);
    const [activeSelection, setActiveSelection] = useState('pickup'); // 'pickup' or 'destination'
    const [suggestions, setSuggestions] = useState([]);
    const autocompleteTimeout = useRef(null);
    const [cabType, setCabType] = useState('Mini');
    const [fareEstimate, setFareEstimate] = useState(0);
    const [myLocation, setMyLocation] = useState(null);

    // Rentals Package selector state
    const [rentalPackage, setRentalPackage] = useState('1 Hour (10 km) - ₹250');
    const [showOutstationTooltip, setShowOutstationTooltip] = useState(false);

    // OSRM route info from the map
    const [routeInfo, setRouteInfo] = useState(null); // { distanceM, durationS }

    const [mainTab, setMainTab] = useState('booking');
    const [myRides, setMyRides] = useState([]);

    const rentalPackages = [
        { id: '1h', label: '1 Hour (10 km) - ₹250', price: 250 },
        { id: '2h', label: '2 Hours (20 km) - ₹480', price: 480 },
        { id: '4h', label: '4 Hours (40 km) - ₹900', price: 900 },
        { id: '8h', label: '8 Hours (80 km) - ₹1700', price: 1700 },
        { id: '12h', label: '12 Hours (120 km) - ₹2500', price: 2500 }
    ];

    useEffect(() => {
        api.get('/rides').then(res => setMyRides(res.data)).catch(err => console.error(err));

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { longitude, latitude } = pos.coords;
                    if (isFinite(latitude) && isFinite(longitude)) {
                        setMyLocation({ lng: longitude, lat: latitude });
                    }
                },
                (err) => console.warn('Geoloc error:', err),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }, []);

    const handleInputChange = (text, type) => {
        if (type === 'pickup') {
            setPickup(text);
            setActiveSelection('pickup');
        } else {
            setDestination(text);
            setActiveSelection('destination');
        }

        if (autocompleteTimeout.current) clearTimeout(autocompleteTimeout.current);
        if (text.length < 3) {
            setSuggestions([]);
            return;
        }

        autocompleteTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=5`);
                const data = await res.json();
                setSuggestions(data);
            } catch (err) {}
        }, 800);
    };

    const selectSuggestion = (item) => {
        const coords = [parseFloat(item.lon), parseFloat(item.lat)];
        const addr = item.display_name.split(',')[0];
        if (activeSelection === 'pickup') {
            setPickupPos(coords);
            setPickup(addr);
            if (activeTab !== 'rentals') setActiveSelection('destination');
        } else {
            setDestPos(coords);
            setDestination(addr);
            setActiveSelection('pickup');
        }
        setSuggestions([]);
    };

    const handleMapClick = async ([lng, lat]) => {
        if (bookingPhase !== 'search') return;
        
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const data = await res.json();
            const address = data.display_name?.split(',')[0] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            
            if (activeSelection === 'pickup') {
                setPickupPos([lng, lat]);
                setPickup(address);
                if (activeTab !== 'rentals') setActiveSelection('destination');
            } else if (activeTab !== 'rentals') {
                setDestPos([lng, lat]);
                setDestination(address);
                setActiveSelection('pickup');
            }
        } catch (err) {
            console.error('Geocoding error:', err);
            // Fallback if geocoding fails
            const fallbackAddr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            if (activeSelection === 'pickup') {
                setPickupPos([lng, lat]);
                setPickup(fallbackAddr);
                if (activeTab !== 'rentals') setActiveSelection('destination');
            } else if (activeTab !== 'rentals') {
                setDestPos([lng, lat]);
                setDestination(fallbackAddr);
                setActiveSelection('pickup');
            }
        }
    };

    // Reset route info whenever pickup / destination changes
    useEffect(() => { setRouteInfo(null); }, [pickup, destination]);

    const calculateFare = (e) => {
        e.preventDefault();
        
        let calculatedFare = 0;
        if (activeTab === 'rentals') {
            const selectedPkg = rentalPackages.find(p => p.label === rentalPackage);
            calculatedFare = selectedPkg ? selectedPkg.price : 250;
        } else {
            // Use OSRM real distance (metres → km), fall back to 10 km if not yet loaded
            const km = routeInfo ? routeInfo.distanceM / 1000 : 10;
            const baseFares = { 
                '4 Seater': 12, '5 Seater': 14, '6 Seater': 18, '7 Seater': 22, 
                'Mini': 10, 'Sedan': 15, 'SUV': 25, 'Auto': 8 
            };
            let rate = baseFares[cabType] || 10;
            // Outstation rides cost 1.5x standard rates
            if (activeTab === 'outstation') rate = Math.round(rate * 1.5);
            calculatedFare = Math.round(km * rate);
        }
        
        setFareEstimate(calculatedFare);
        setBookingPhase('selecting');
    };

    const bookRide = async () => {
        setBookingPhase('requesting');
        
        if (!pickupPos || (activeTab !== 'rentals' && !destPos)) {
            alert('Please select pickup and destination locations on the map.');
            setBookingPhase('search');
            return;
        }

        const finalDestination = activeTab === 'rentals' ? `Rental: ${rentalPackage}` : destination;
        const finalDestCoords = activeTab === 'rentals' ? pickupPos : destPos;

        try {
             const response = await api.post('/rides', {
                 pickup,
                 destination: finalDestination,
                 pickupCoordinates: pickupPos,
                 destinationCoordinates: finalDestCoords,
                 distance: routeInfo ? parseFloat((routeInfo.distanceM / 1000).toFixed(2)) : (activeTab === 'rentals' ? 0 : 10),
                 duration: routeInfo ? Math.ceil(routeInfo.durationS / 60) : (activeTab === 'rentals' ? 60 : 15),
                 fare: fareEstimate,
                 cabType,
                 rideType: activeTab
             });

             // If backend says no driver found, show error instantly — no socket needed
             if (!response.data.driverFound) {
                 alert('No drivers are currently available. Please try again shortly.');
                 setBookingPhase('search');
                 return;
             }

             const rideId = response.data._id;
             const socket = io(import.meta.env.VITE_API_URL, {
    auth: { token: user?.token || storedUser?.token },
    withCredentials: true,
});

             socket.on('connect', () => {
                 console.log('Passenger socket connected for ride:', rideId);
                 socket.emit('joinRideRoom', { rideId });
             });

             socket.on('rideAccepted', (data) => {
                 clearInterval(pollTimer);
                 clearTimeout(timeoutTimer);
                 socket.close();
                 navigate(`/ride/${data.rideId}`);
             });

             socket.on('noDriversAvailable', (data) => {
                 clearInterval(pollTimer);
                 clearTimeout(timeoutTimer);
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
                         clearTimeout(timeoutTimer);
                         socket.close();
                         navigate(`/ride/${rideId}`);
                     } else if (rideRes.data.rideStatus === 'cancelled') {
                         clearInterval(pollTimer);
                         clearTimeout(timeoutTimer);
                         socket.close();
                         alert('Ride was cancelled. Please try again.');
                         setBookingPhase('search');
                     }
                 } catch (_) {}
             }, 3000);

             // Timeout after 90 seconds — only fires if no driver responded
             const timeoutTimer = setTimeout(() => {
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
        <div className="min-h-[calc(100vh-4rem)] bg-gray-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900">Passenger Dashboard</h1>
                        <p className="text-gray-500 mt-2">Welcome back, {user?.name}. Where to today?</p>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
                    <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-gray-100 max-w-xl w-full mx-auto lg:mx-0">
                            {/* Booking category selectors */}
                            <div className="flex flex-wrap md:flex-nowrap justify-between gap-4 items-center border-b border-gray-100 pb-4 mb-8">
                                <button
                                    onClick={() => { setActiveTab('daily'); setBookingPhase('search'); }}
                                    className={`text-sm md:text-base font-black tracking-wider uppercase transition-all pb-1.5 outline-none flex-1 text-center
                                        ${activeTab === 'daily' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    Daily
                                </button>
                                <button
                                    onClick={() => { setActiveTab('outstation'); setBookingPhase('search'); }}
                                    className={`text-sm md:text-base font-black tracking-wider uppercase transition-all pb-1.5 outline-none flex-1 text-center
                                        ${activeTab === 'outstation' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    Outstation
                                </button>
                                <button
                                    onClick={() => { setActiveTab('rentals'); setBookingPhase('search'); }}
                                    className={`text-sm md:text-base font-black tracking-wider uppercase transition-all px-2 md:px-4 py-1.5 rounded-full outline-none flex-1 text-center
                                        ${activeTab === 'rentals' ? 'bg-[#CCEC43] text-gray-900 shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                    Rentals
                                </button>
                            </div>

                            {bookingPhase === 'search' && (
                                <form onSubmit={calculateFare} className="space-y-6">
                                    <div className="space-y-4">
                                        <div className={`relative transition ${activeSelection === 'pickup' ? 'ring-2 ring-black rounded-xl' : ''}`}>
                                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#EAB308]">📍</span>
                                            <input
                                                type="text"
                                                onClick={() => { setActiveSelection('pickup'); setSuggestions([]); }}
                                                onChange={(e) => handleInputChange(e.target.value, 'pickup')}
                                                className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-gray-50 font-semibold focus:outline-none"
                                                value={pickup}
                                                placeholder="Type or click map for Pickup"
                                                required
                                            />
                                            {activeSelection === 'pickup' && suggestions.length > 0 && (
                                                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                                                    {suggestions.map((s, i) => (
                                                        <div key={i} className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0 truncate" onClick={() => selectSuggestion(s)}>
                                                            {s.display_name}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {activeTab === 'rentals' ? (
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-emerald-500">📦</span>
                                                <select
                                                    className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-gray-50 font-semibold focus:border-black focus:ring-2 focus:ring-black/5 outline-none cursor-pointer"
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
                                            <div className={`relative transition ${activeSelection === 'destination' ? 'ring-2 ring-black rounded-xl' : ''}`}>
                                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-red-500">🏁</span>
                                                <input
                                                    type="text"
                                                    onClick={() => { setActiveSelection('destination'); setSuggestions([]); }}
                                                    onChange={(e) => handleInputChange(e.target.value, 'destination')}
                                                    className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-gray-50 font-semibold focus:outline-none"
                                                    value={destination}
                                                    placeholder="Type or click map for Destination"
                                                    required
                                                />
                                                {activeSelection === 'destination' && suggestions.length > 0 && (
                                                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                                                        {suggestions.map((s, i) => (
                                                            <div key={i} className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0 truncate" onClick={() => selectSuggestion(s)}>
                                                                {s.display_name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="font-extrabold text-gray-700 text-xs uppercase tracking-wider mb-3">Select Cab Class</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {['Mini', 'Sedan', 'SUV', 'Auto', '4 Seater', '5 Seater', '6 Seater', '7 Seater'].map((type) => (
                                                <button 
                                                    type="button"
                                                    key={type}
                                                    onClick={() => setCabType(type)}
                                                    className={`p-3 rounded-xl font-bold border text-sm transition-all duration-200
                                                        ${cabType === type 
                                                            ? 'border-yellow-400 bg-yellow-50 text-black font-extrabold shadow-sm' 
                                                            : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button 
                                        type="submit" 
                                        className="w-full bg-gray-900 hover:bg-black text-white font-extrabold text-base py-4 rounded-xl transition shadow-md mt-6 uppercase tracking-wide"
                                    >
                                        Get Fare Estimate
                                    </button>
                                </form>
                            )}

                            {bookingPhase === 'selecting' && (
                                <div className="space-y-6">
                                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                        <h2 className="text-gray-500 font-bold uppercase tracking-wider text-xs mb-1">Estimated Fare</h2>
                                        <h1 className="text-5xl font-black text-black">₹{fareEstimate}</h1>
                                        <p className="text-gray-400 text-sm mt-3 font-bold">
                                            For a {cabType} class ({activeTab === 'rentals' ? 'Rental Package' : activeTab === 'outstation' ? 'Outstation Intercity' : 'Daily Commute'})
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <button 
                                            onClick={bookRide} 
                                            className="w-full bg-yellow-400 text-black font-extrabold text-lg py-4 rounded-xl shadow-md hover:bg-yellow-500 transition-all"
                                        >
                                            Confirm Booking
                                        </button>
                                        <button 
                                            onClick={() => setBookingPhase('search')} 
                                            className="w-full bg-white border border-gray-200 text-gray-700 font-bold text-lg py-4 rounded-xl hover:bg-gray-50 transition"
                                        >
                                            Edit Details
                                        </button>
                                    </div>
                                </div>
                            )}

                            {bookingPhase === 'requesting' && (
                                <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
                                    <div className="w-16 h-16 border-4 border-gray-100 border-t-yellow-400 rounded-full animate-spin mb-6"></div>
                                    <h2 className="text-2xl font-black mb-2 text-gray-900">Finding your driver</h2>
                                    <p className="text-gray-500">Contacting nearby available {cabType} drivers in the area...</p>
                                </div>
                            )}
                        </div>

                        <div className="flex-1">
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden" style={{ minHeight: '420px' }}>
                                {/* Map header */}
                                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
                                    <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
                                    <h3 className="text-sm font-bold text-gray-700">Route Preview</h3>
                                    {routeInfo && (
                                        <span className="ml-auto text-xs font-bold text-gray-500">
                                            {(routeInfo.distanceM / 1000).toFixed(1)} km
                                            &nbsp;&bull;&nbsp;
                                            {Math.ceil(routeInfo.durationS / 60)} min
                                        </span>
                                    )}
                                </div>
                                {(() => {
                                    const center = pickupPos
                                        ? [pickupPos[1], pickupPos[0]]
                                        : myLocation 
                                            ? [myLocation.lat, myLocation.lng] 
                                            : [11.0168, 76.9558];
                                    return (
                                        <div style={{ height: '380px' }}>
                                            <LeafletMap
                                                center={center}
                                                zoom={13}
                                                height="380px"
                                                myPos={myLocation}
                                                pickupPos={pickupPos || null}
                                                destPos={activeTab !== 'rentals' ? (destPos || null) : null}
                                                pickupLabel={pickup || 'Pickup'}
                                                destLabel={destination || 'Destination'}
                                                showRoute={activeTab !== 'rentals'}
                                                onRouteInfo={setRouteInfo}
                                                onMapClick={handleMapClick}
                                            />
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    );
};

export default PassengerDashboard;
