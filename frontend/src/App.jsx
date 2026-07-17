import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import PassengerDashboard from './pages/PassengerDashboard';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import RideTracking from './pages/RideTracking';
import NotFound from './pages/NotFound';
import PassengerProfile from './pages/PassengerProfile';
import DriverProfile from './pages/DriverProfile';
import AdminProfile from './pages/AdminProfile';

function App() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={!user ? <Navigate to="/login" /> : <Navigate to={`/${user.role}-dashboard`} />} />
          <Route path="/login" element={!user ? <Login /> : <Navigate to={`/${user.role}-dashboard`} />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to={`/${user.role}-dashboard`} />} />
          <Route path="/admin-signup" element={!user ? <Register /> : <Navigate to={`/${user.role}-dashboard`} />} />
          
          <Route path="/passenger-dashboard" element={user && user.role === 'passenger' ? <PassengerDashboard /> : <Navigate to="/login" />} />
          <Route path="/driver-dashboard" element={user && user.role === 'driver' ? <DriverDashboard /> : <Navigate to="/login" />} />
          <Route path="/admin-dashboard" element={user && user.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />} />
          
          {/* Profile Routes */}
          <Route path="/passenger-profile" element={user && user.role === 'passenger' ? <PassengerProfile /> : <Navigate to="/login" />} />
          <Route path="/driver-profile" element={user && user.role === 'driver' ? <DriverProfile /> : <Navigate to="/login" />} />
          <Route path="/admin-profile" element={user && user.role === 'admin' ? <AdminProfile /> : <Navigate to="/login" />} />

          <Route path="/ride/:id" element={user ? <RideTracking /> : <Navigate to="/login" />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
