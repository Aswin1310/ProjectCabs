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
        api.get('/locations').then(res => {
            setLocations(res.data);
            if (res.data.length > 0) {
                setPickup(res.data[0].name);
                setDestination(res.data[Math.min(1, res.data.length - 1)].name);
            }
        }).catch(err => console.error("Failed to load locations", err));

        api.get('/rides').then(res => setMyRides(res.data)).catch(err => console.error(err));
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
                                        <div className="relative">
                                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#EAB308]">📍</span>
                                            <select
                                                className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-gray-50 font-semibold focus:border-black focus:ring-2 focus:ring-black/5 outline-none cursor-pointer"
                                                value={pickup}
                                                onChange={(e) => setPickup(e.target.value)}
                                                required
                                            >
                                                <option value="" disabled>Select Pickup Location</option>
                                                {locations.map(loc => <option key={loc._id} value={loc.name}>{loc.name}</option>)}
                                            </select>
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
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-red-500">🏁</span>
                                                <select
                                                    className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-gray-50 font-semibold focus:border-black focus:ring-2 focus:ring-black/5 outline-none cursor-pointer"
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
                            <div className="bg-white p-5 md:p-8 rounded-3xl shadow-sm border border-gray-100">
                                <h3 className="text-xl font-bold mb-4">Why ride with us?</h3>
                                <ul className="space-y-4 text-gray-600">
                                    <li className="flex items-center gap-3"><span className="text-yellow-500">✓</span> Professional, vetted drivers</li>
                                    <li className="flex items-center gap-3"><span className="text-yellow-500">✓</span> 24/7 dedicated support</li>
                                    <li className="flex items-center gap-3"><span className="text-yellow-500">✓</span> Real-time ride tracking</li>
                                    <li className="flex items-center gap-3"><span className="text-yellow-500">✓</span> Affordable upfront pricing</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    );
};

export default PassengerDashboard;
