import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav className="bg-[#0F0F10] text-white shadow-xl sticky top-0 z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="bg-[#EAB308] text-black p-1.5 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16V10a2 2 0 00-2-2h-6" />
              </svg>
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white">GoCab</span>
          </Link>

          {/* Nav Items */}
          <div className="flex items-center gap-3">
            {!user ? (
              <>
                <Link to="/login" className="text-stone-300 hover:text-white text-sm font-bold transition">Login</Link>
                <Link to="/register" className="bg-[#EAB308] text-black px-4 py-2 rounded-xl text-sm font-extrabold hover:bg-[#CA8A04] transition shadow-md">Sign Up</Link>
              </>
            ) : (
              <>
                <Link to={`/${user.role}-dashboard`} className="text-stone-300 hover:text-white text-sm font-bold transition hidden sm:block">
                  Dashboard
                </Link>
                {/* Profile Avatar Button */}
                <Link
                  to={`/${user.role}-profile`}
                  title={`View ${user.role} profile`}
                  className="flex items-center gap-2 bg-stone-800 hover:bg-stone-700 border border-white/10 rounded-xl px-3 py-1.5 transition group outline-none"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#EAB308] flex items-center justify-center text-black font-black text-sm">
                    {(user.name || 'U')[0].toUpperCase()}
                  </div>
                  <span className="text-stone-200 text-sm font-bold hidden sm:block">{user.name?.split(' ')[0]}</span>
                  <svg className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-200 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
