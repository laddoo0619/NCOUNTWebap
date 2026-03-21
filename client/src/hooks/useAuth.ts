import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { User, AuthResponse } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('ncount_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const { data } = await api.post<AuthResponse>('/auth/login', { username, password });
      localStorage.setItem('ncount_token', data.token);
      localStorage.setItem('ncount_user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ncount_token');
    localStorage.removeItem('ncount_user');
    setUser(null);
  }, []);

  return { user, loading, login, logout, isAuthenticated: !!user };
}
