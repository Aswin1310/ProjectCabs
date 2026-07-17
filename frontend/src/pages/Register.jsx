import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import cabIllustration from '../assets/cab_booking_illustration.png';

const Register = () => {
  const { registerPassenger, registerDriver, registerAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  
  const urlType = queryParams.get('type');
  const isUrlAdmin = urlType === 'admin' || location.pathname === '/admin-signup';
  const isUrlDriver = urlType === 'driver';

  const [selectedRole, setSelectedRole] = useState(
    isUrlAdmin ? 'admin' : isUrlDriver ? 'driver' : 'passenger'
  );

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    vehicleType: 'Mini',
    vehicleNumber: '',
    licenseNumber: '',
    adminKey: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isUrlAdmin) setSelectedRole('admin');
    else if (isUrlDriver) setSelectedRole('driver');
    else setSelectedRole('passenger');
  }, [urlType, location.pathname]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRoleSelect = (roleName) => {
    setSelectedRole(roleName);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (selectedRole === 'admin') {
        await registerAdmin(formData);
      } else if (selectedRole === 'driver') {
        await registerDriver(formData);
      } else {
        await registerPassenger(formData);
      }
      navigate(`/${selectedRole === 'admin' ? 'admin' : selectedRole === 'driver' ? 'driver' : 'passenger'}-dashboard`);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { id: 'passenger', label: 'Rider / Passenger', desc: 'Book a ride & travel across town' },
    { id: 'driver', label: 'Driver', desc: 'Join the fleet & earn on your schedule' },
    { id: 'admin', label: 'Admin', desc: 'Manage rides, users & fleet analytics' },
  ];

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] bg-[#FAFAF9]">
      
      {/* LEFT PANEL: Deep Dark Cab Branding */}
      <div className="w-full lg:w-1/2 bg-[#0F0F10] text-white p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="absolute -left-16 -top-16 w-64 h-64 rounded-full bg-[#EAB308] opacity-10 filter blur-3xl"></div>
        <div className="absolute right-0 bottom-0 w-80 h-80 rounded-full bg-[#EAB308] opacity-5 filter blur-3xl"></div>

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-[#EAB308] p-2.5 rounded-xl shadow-md flex items-center justify-center text-black">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16V10a2 2 0 00-2-2h-6" />
            </svg>
          </div>
          <div>
            <h2 className="font-bold text-[#fafaf9] leading-tight text-lg">GoCab</h2>
            <p className="text-xs text-[#a8a29e]">Real-time Ride Platform</p>
          </div>
        </div>

        {/* Status Badge & Title */}
        <div className="relative z-10 my-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <span>🚖</span> New Account
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
            Join the fleet<br />or book a ride.
          </h1>
          <p className="text-sm text-stone-400 max-w-sm">
            Choose your role below to get started. Real-time fleet tracking, instant fare checks, and seamless dispatching.
          </p>
        </div>

        {/* Roles Cards & Illustration Grid */}
        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start my-4">
          
          {/* Roles list */}
          <div className="w-full md:w-3/5 space-y-3">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => handleRoleSelect(role.id)}
                className={`w-full text-left p-4 rounded-xl border flex items-center justify-between transition-all duration-200 outline-none
                  ${selectedRole === role.id 
                    ? 'border-[#EAB308] bg-stone-900/60 shadow-lg' 
                    : 'border-white/5 bg-stone-900/20 hover:bg-stone-900/40 hover:border-white/10'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedRole === role.id ? 'bg-[#EAB308]/20 text-[#EAB308]' : 'bg-stone-800 text-stone-400'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {role.id === 'admin' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      ) : role.id === 'driver' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16V10a2 2 0 00-2-2h-6" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      )}
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#fafaf9]">{role.label}</h4>
                    <p className="text-xs text-stone-400 mt-0.5">{role.desc}</p>
                  </div>
                </div>
                {selectedRole === role.id && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#EAB308] shadow-[0_0_8px_#EAB308]"></div>
                )}
              </button>
            ))}
          </div>

          {/* Cab Booking Illustration */}
          <div className="hidden md:flex w-2/5 p-2 relative flex-col items-center justify-center min-h-[220px]">
            <img 
              src={cabIllustration} 
              alt="GoCab Service Illustration" 
              className="w-full h-auto object-contain max-h-[160px] rounded-xl"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            {/* Cab Overlay Badges */}
            <div className="absolute top-1/4 -left-4 bg-stone-900/80 backdrop-blur-md border border-white/10 rounded-xl p-2 px-3 shadow-xl leading-tight">
              <span className="text-[10px] text-stone-400 block font-semibold uppercase tracking-wider">Quick Match</span>
              <span className="text-xs font-bold text-yellow-500">&lt; 5 mins response</span>
            </div>
            <div className="absolute bottom-1/4 -right-2 bg-stone-900/80 backdrop-blur-md border border-white/10 rounded-xl p-2 px-3 shadow-xl leading-tight">
              <span className="text-[10px] text-stone-400 block font-semibold uppercase tracking-wider">Pricing</span>
              <span className="text-xs font-bold text-yellow-500">Base ₹15/km</span>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <div className="relative z-10 pt-4 border-t border-white/5 mt-auto flex justify-between items-center text-xs text-stone-500">
          <span>&copy; {new Date().getFullYear()} GoCab Fleet</span>
          <span className="hover:text-stone-300 cursor-pointer">Live Dispatching</span>
        </div>

      </div>

      {/* RIGHT PANEL: Form Body */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-md">
          
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-[#1c1917] tracking-tight">Create your account</h2>
            <p className="text-sm text-stone-500 mt-2">Get access to the GoCab platform in seconds</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 text-sm font-semibold mb-6 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  className="w-full bg-white border border-stone-200 rounded-xl p-3.5 pl-11 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@gocab.com"
                  required
                  className="w-full bg-white border border-stone-200 rounded-xl p-3.5 pl-11 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Phone Number</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="9876543210"
                  required
                  className="w-full bg-white border border-stone-200 rounded-xl p-3.5 pl-11 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min. 6 characters"
                  required
                  minLength="6"
                  className="w-full bg-white border border-stone-200 rounded-xl p-3.5 pl-11 pr-11 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 outline-none"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    )}
                    {!showPassword && (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Confirm Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repeat password"
                  required
                  className="w-full bg-white border border-stone-200 rounded-xl p-3.5 pl-11 pr-11 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 outline-none"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showConfirmPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    )}
                    {!showConfirmPassword && (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* DYNAMIC FIELD: Admin Key */}
            {selectedRole === 'admin' && (
              <div className="animate-fadeIn">
                <label className="block text-xs font-bold uppercase tracking-wider text-red-500 mb-1.5">Secret Admin Key</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-red-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m-5a5 5 0 11-10 0 5 5 0 0110 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </span>
                  <input
                    type="password"
                    name="adminKey"
                    value={formData.adminKey}
                    onChange={handleChange}
                    placeholder="Enter security admin key"
                    required
                    className="w-full bg-white border border-red-200 rounded-xl p-3.5 pl-11 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10 text-stone-800 font-medium transition"
                  />
                </div>
              </div>
            )}

            {/* DYNAMIC FIELDS: Driver Cab Info */}
            {selectedRole === 'driver' && (
              <div className="space-y-4 border-l-2 border-stone-200 pl-4 animate-fadeIn">
                
                {/* Vehicle Type */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Select Vehicle Class</label>
                  <select
                    name="vehicleType"
                    value={formData.vehicleType}
                    onChange={handleChange}
                    required
                    className="w-full bg-white border border-stone-200 rounded-xl p-3.5 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                  >
                    <option value="Mini">Mini</option>
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Auto">Auto</option>
                    <option value="4 Seater">4 Seater</option>
                    <option value="5 Seater">5 Seater</option>
                    <option value="6 Seater">6 Seater</option>
                    <option value="7 Seater">7 Seater</option>
                  </select>
                </div>

                {/* Vehicle Number */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Vehicle Registration Number</label>
                  <input
                    type="text"
                    name="vehicleNumber"
                    value={formData.vehicleNumber}
                    onChange={handleChange}
                    placeholder="e.g. TN-37-BY-1234"
                    required
                    className="w-full bg-white border border-stone-200 rounded-xl p-3.5 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                  />
                </div>

                {/* Driver License Number */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Commercial License Number</label>
                  <input
                    type="text"
                    name="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={handleChange}
                    placeholder="e.g. DL-1420230098765"
                    required
                    className="w-full bg-white border border-stone-200 rounded-xl p-3.5 text-sm outline-none focus:border-[#EAB308] focus:ring-2 focus:ring-[#EAB308]/10 text-stone-800 font-medium transition"
                  />
                </div>

              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#EAB308] hover:bg-[#CA8A04] disabled:bg-stone-400 text-black font-extrabold text-sm py-4 rounded-xl transition shadow-lg flex items-center justify-center gap-2 outline-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Create Account</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>

          </form>

          {/* Footer Navigation */}
          <div className="text-center mt-6">
            <p className="text-sm text-stone-500">
              Already have an account?{' '}
              <Link to="/login" className="text-[#EAB308] font-bold hover:underline">
                Sign in
              </Link>
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Register;
