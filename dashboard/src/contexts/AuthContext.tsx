'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  getAuthHeader: () => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);

  // Check for existing credentials on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('admin_user');
    const storedPass = localStorage.getItem('admin_pass');

    if (storedUser && storedPass) {
      // Verify credentials are still valid
      verifyCredentials(storedUser, storedPass).then((valid) => {
        if (valid) {
          setUsername(storedUser);
          setIsAuthenticated(true);
        } else {
          // Clear invalid credentials
          localStorage.removeItem('admin_user');
          localStorage.removeItem('admin_pass');
        }
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const getApiBase = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return 'http://localhost:3847';
  };

  const verifyCredentials = async (user: string, pass: string): Promise<boolean> => {
    try {
      const response = await fetch(`${getApiBase()}/admin/status`, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${user}:${pass}`),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const login = async (user: string, pass: string): Promise<boolean> => {
    const valid = await verifyCredentials(user, pass);
    if (valid) {
      localStorage.setItem('admin_user', user);
      localStorage.setItem('admin_pass', pass);
      setUsername(user);
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('admin_user');
    localStorage.removeItem('admin_pass');
    setUsername(null);
    setIsAuthenticated(false);
  };

  const getAuthHeader = () => {
    const user = localStorage.getItem('admin_user') || 'admin';
    const pass = localStorage.getItem('admin_pass') || 'admin';
    return 'Basic ' + btoa(`${user}:${pass}`);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, username, login, logout, getAuthHeader }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
