import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import cabIllustration from '../assets/cab_booking_illustration.png';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await login(email, password);
      // Automatically navigate to correct role dashboard
      navigate(`/${response.role}-dashboard`);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

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

        {/* Slogan */}
        <div className="relative z-10 my-8">
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            From request<br />
            to arrival,<br />
            <span className="text-[#EAB308]">all in one tap.</span>
          </h1>
          <p className="text-stone-400 text-sm max-w-sm">
            Skip the wait and commute smarter with real-time location-aware cab scheduling.
          </p>
        </div>

        {/* Features Blocks & Illustration */}
        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center my-4">
          
          {/* List features grid */}
          <div className="w-full md:w-3/5 grid grid-cols-1 gap-2.5">
            {[
              { label: 'Instant Dispatch', icon: '⚡' },
              { label: 'Live Location Tracking', icon: '📍' },
              { label: 'Security & Safety OTP', icon: '🛡️' },
              { label: 'Professional Rated Fleet', icon: '⭐️' }
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl border border-white/5 bg-stone-900/20 hover:bg-stone-900/40 transition">
                <span className="text-lg bg-stone-800 p-1.5 rounded-lg">{f.icon}</span>
                <span className="text-sm font-semibold text-stone-250">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Cab Illustration */}
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
              <span className="text-[10px] text-stone-400 block font-semibold uppercase tracking-wider">Fast Booking</span>
              <span className="text-xs font-bold text-yellow-500">&lt; 5 mins response</span>
            </div>
            <div className="absolute bottom-1/4 -right-2 bg-stone-900/80 backdrop-blur-md border border-white/10 rounded-xl p-2 px-3 shadow-xl leading-tight">
              <span className="text-[10px] text-stone-400 block font-semibold uppercase tracking-wider">Fare Index</span>
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
            <h2 className="text-3xl font-extrabold text-[#1c1917] tracking-tight">Welcome back</h2>
            <p className="text-sm text-stone-500 mt-2">Sign in to your GoCab account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3.5 text-sm font-semibold mb-6 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Email Address */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">Email address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gocab.com"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
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
                  <span>Sign In</span>
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
              Don't have an account?{' '}
              <Link to="/register" className="text-[#EAB308] font-bold hover:underline">
                Create one
              </Link>
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Login;
