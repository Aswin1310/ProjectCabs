import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to load user profile if token/cookie exists
    const loadUser = async () => {
      // Small trick: We check if localStorage has 'user' metadata to avoid unnecessary API calls
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
          setUser(JSON.parse(storedUser));
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    setUser(response.data);
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  };

  const registerPassenger = async (data) => {
    const response = await api.post('/auth/register', { ...data, role: 'passenger' });
    setUser(response.data);
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  };

  const registerDriver = async (data) => {
    const response = await api.post('/driver/register', { ...data, role: 'driver' });
    setUser(response.data);
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  };

  const registerAdmin = async (data) => {
    const response = await api.post('/auth/register', { ...data, role: 'admin' });
    setUser(response.data);
    localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, registerPassenger, registerDriver, registerAdmin, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
